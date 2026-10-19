#!/usr/bin/env bun
// PreToolUse hook for Agent and Workflow: asks Jev which model and effort each subagent needs.
// Any failure exits 0 with no output, so the tool call runs unchanged.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG } from "./config";
import { askJev, decide, effortFor, questionsFor } from "./jev";
import { log } from "./store";
import { routeScript } from "./workflow";

type HookInput = { tool_name: string; tool_input: Record<string, any>; cwd?: string };

function emit(decision: "allow" | "ask", updatedInput: Record<string, any>, reason: string) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
        updatedInput,
      },
    }),
  );
}

async function routeAgent(input: Record<string, any>) {
  if (CONFIG.skipSubagentTypes.includes(input.subagent_type)) return;
  if (input.model && input.effort) return;

  const state = {
    task: {
      subagent_type: input.subagent_type ?? "general-purpose",
      description: input.description,
      prompt: String(input.prompt ?? "").slice(0, CONFIG.maxPromptChars),
    },
  };
  const d = decide(await askJev(state, questionsFor("t", "`task`")), "t");

  // An explicit model from the main session wins; effort is only filled in.
  const model = input.model ?? d.model;
  const effort = input.effort ?? effortFor(model, d.effort);
  log({
    tool: "Agent",
    description: input.description,
    model,
    effort,
    jev: d,
    explicit: { model: input.model, effort: input.effort },
  });

  const updated = { ...input, model, ...(effort ? { effort } : {}) };
  emit("allow", updated, `model-router: ${model}${effort ? `/${effort}` : ""}`);
}

function resolveNamed(name: string, cwd: string) {
  const dirs = [
    join(process.env.CLAUDE_PROJECT_DIR ?? cwd, ".claude", "workflows"),
    join(homedir(), ".claude", "workflows"),
  ];
  for (const dir of dirs) {
    for (const ext of [".js", ".mjs"]) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
}

async function routeWorkflow(input: Record<string, any>, cwd: string) {
  let src: string | undefined = input.script;
  if (input.scriptPath) src = readFileSync(input.scriptPath, "utf8");
  else if (!src && input.name) {
    const p = resolveNamed(input.name, cwd);
    if (!p) return; // built-in workflow: nothing to rewrite
    src = readFileSync(p, "utf8");
  }
  if (!src) return;

  const { script, applied } = await routeScript(src);
  if (!applied.length) return;
  log({ tool: "Workflow", source: input.scriptPath ?? input.name ?? "inline", applied });

  const { scriptPath, name, ...rest } = input;
  const summary = applied.map((a) => `${a.label}  ${a.snippet.split("\n")[0].slice(0, 80)}`).join("\n");
  // "ask" keeps the workflow consent prompt and shows the routing in it.
  emit("ask", { ...rest, script }, `model-router routed ${applied.length} agent() call(s):\n${summary}`);
}

try {
  const hook = (await Bun.stdin.json()) as HookInput;
  const cwd = hook.cwd ?? process.cwd();
  if (hook.tool_name === "Agent") await routeAgent(hook.tool_input);
  else if (hook.tool_name === "Workflow") await routeWorkflow(hook.tool_input, cwd);
} catch (err) {
  try {
    log({ error: String(err) });
  } catch {}
}
process.exit(0);
