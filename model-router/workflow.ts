import * as acorn from "acorn";
import { simple } from "acorn-walk";
import { CONFIG } from "./config";
import { askJev, capEffort, capTier, type Decision, decide, effortFor, questionsFor } from "./jev";
import { cached, hash, remember } from "./store";

type Node = acorn.Node & Record<string, any>;

type Site = { id: string; call: Node; opts?: Node; has: Set<string>; snippet: string; key: string };

function parse(src: string) {
  return acorn.parse(src, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
  });
}

function propName(p: Node) {
  if (p.type !== "Property" || p.computed) return undefined;
  return p.key.type === "Identifier" ? p.key.name : p.key.value;
}

function findSites(src: string, scriptHash: string): Site[] {
  const sites: Site[] = [];
  simple(parse(src), {
    CallExpression(n: Node) {
      if (n.callee.type !== "Identifier" || n.callee.name !== "agent" || !n.arguments.length) return;
      const opts = n.arguments[1] as Node | undefined;
      const has = new Set<string>();
      if (opts?.type === "ObjectExpression") {
        for (const p of opts.properties) {
          const name = propName(p);
          if (name) has.add(name);
        }
      }
      if (has.has("model") && has.has("effort")) return;
      const snippet = src.slice(n.start, n.end).slice(0, CONFIG.maxSnippetChars);
      // A literal prompt describes itself; `agent(d.prompt)` only means something within this script.
      const literal = ["Literal", "TemplateLiteral"].includes(n.arguments[0].type);
      const key = `wf:${hash(literal ? snippet : snippet + scriptHash)}`;
      sites.push({ id: `c${sites.length}`, call: n, opts, has, snippet, key });
    },
  });
  return sites;
}

// With an explicit model in opts we can't know which tier it is, so effort is still filled in.
function optsText(d: Decision, has: Set<string>) {
  const parts: string[] = [];
  if (!has.has("model")) parts.push(`model: ${JSON.stringify(d.model)}`);
  const effort = has.has("model") ? (d.effort === "none" ? undefined : d.effort) : effortFor(d.model, d.effort);
  if (effort && !has.has("effort")) parts.push(`effort: ${JSON.stringify(effort)}`);
  return parts.join(", ");
}

export async function routeScript(src: string) {
  const sites = findSites(src, hash(src));
  const decisions = new Map<string, Decision>();
  const pending = sites.filter((s) => {
    const hit = cached(s.key);
    if (hit) decisions.set(s.id, { ...hit, model: capTier(hit.model), effort: capEffort(hit.effort) });
    return !hit;
  });

  if (pending.length) {
    const questions = Object.assign({}, ...pending.map((s) => questionsFor(s.id, `agent_calls.${s.id}`)));
    const state = {
      note: "A workflow script that spawns subagents with agent(prompt, opts). Each entry in agent_calls is one agent() call site from the script.",
      script: src.slice(0, CONFIG.maxScriptChars),
      agent_calls: Object.fromEntries(pending.map((s) => [s.id, s.snippet])),
    };
    const answers = await askJev(state, questions);
    for (const s of pending) {
      const d = decide(answers, s.id);
      decisions.set(s.id, d);
      remember(s.key, d);
    }
  }

  // Apply edits from the end of the file backwards so earlier offsets stay valid.
  let out = src;
  const applied: { snippet: string; label: string; decision: Decision; cached: boolean }[] = [];
  for (const s of [...sites].sort((a, b) => b.call.start - a.call.start)) {
    const d = decisions.get(s.id)!;
    const text = optsText(d, s.has);
    if (!text) continue;
    if (!s.opts) {
      const at = s.call.arguments[0].end;
      out = `${out.slice(0, at)}, { ${text} }${out.slice(at)}`;
    } else if (s.opts.type === "ObjectExpression") {
      // Insert first so any explicit spread later in the object still wins.
      const at = s.opts.start + 1;
      out = `${out.slice(0, at)} ${text},${out.slice(at)}`;
    } else {
      const orig = out.slice(s.opts.start, s.opts.end);
      out = `${out.slice(0, s.opts.start)}{ ${text}, ...(${orig}) }${out.slice(s.opts.end)}`;
    }
    applied.unshift({
      snippet: s.snippet.slice(0, 160),
      label: text.replace(/model: |effort: |"/g, "").replace(", ", "/"),
      decision: d,
      cached: !pending.includes(s),
    });
  }

  parse(out); // throws if the rewrite broke the script; the caller falls back to the original
  return { script: out, applied };
}
