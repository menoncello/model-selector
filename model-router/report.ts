#!/usr/bin/env bun
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Cost of subagents by model, read from the transcripts Claude Code keeps in ~/.claude/projects.
// Usage: bun report.ts [--since YYYY-MM-DD] [--project <substring>]
import { Glob } from "bun";

// USD per million tokens. Source: https://platform.claude.com/docs/en/about-claude/pricing (2026-10-19).
type Price = { input: number; write5m: number; write1h: number; read: number; output: number };
const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
  "claude-sonnet-5-5": { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 },
  "claude-haiku-5-5": { input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 },
};
// Haiku 5.5 charges 5x for prompts over 100k tokens.
const HAIKU_LONG = { threshold: 100_000, factor: 5 };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const since = flag("--since") ? new Date(flag("--since")!).getTime() : 0;
const projectFilter = flag("--project");

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

function cost(model: string, u: Usage) {
  const p = PRICES[model];
  if (!p) return undefined;
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const w5m = u.cache_creation?.ephemeral_5m_input_tokens ?? (u.cache_creation_input_tokens ?? 0) - w1h;
  const prompt = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + w5m + w1h;
  const f = model.includes("haiku") && prompt > HAIKU_LONG.threshold ? HAIKU_LONG.factor : 1;
  return (
    (f *
      ((u.input_tokens ?? 0) * p.input +
        w5m * p.write5m +
        w1h * p.write1h +
        (u.cache_read_input_tokens ?? 0) * p.read +
        (u.output_tokens ?? 0) * p.output)) /
    1e6
  );
}

type Row = {
  model: string;
  effort: string;
  agents: number;
  output: number;
  prompt: number;
  usd: number;
  asOpus: number;
};
const rows = new Map<string, Row>();
let unpriced = 0;

const root = join(homedir(), ".claude", "projects");
for (const rel of new Glob("*/*/subagents/**/agent-*.jsonl").scanSync(root)) {
  if (projectFilter && !rel.split("/")[0].includes(projectFilter)) continue;
  const file = join(root, rel);
  if (statSync(file).mtimeMs < since) continue;
  const metaFile = file.replace(/\.jsonl$/, ".meta.json");
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};

  // Streaming writes one line per content block; keep the last usage per message id.
  const byId = new Map<string, { model: string; usage: Usage }>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes('"assistant"')) continue;
    const e = JSON.parse(line);
    if (e.type === "assistant" && e.message?.usage)
      byId.set(e.message.id, { model: e.message.model, usage: e.message.usage });
  }
  if (!byId.size) continue;

  const model = [...byId.values()][0].model;
  // Workflow agents record model in meta but not effort.
  const effort = meta.effort ?? (meta.agentType === "workflow-subagent" ? "not recorded" : "default");
  const key = `${model}|${effort}`;
  const row = rows.get(key) ?? { model, effort, agents: 0, output: 0, prompt: 0, usd: 0, asOpus: 0 };
  row.agents++;
  for (const { model: m, usage: u } of byId.values()) {
    const c = cost(m, u);
    if (c === undefined) {
      unpriced++;
      continue;
    }
    row.usd += c;
    row.asOpus += cost("claude-opus-5-5", u)!;
    row.output += u.output_tokens ?? 0;
    row.prompt += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  }
  rows.set(key, row);
}

const sorted = [...rows.values()].sort((a, b) => b.usd - a.usd);
const fmt = (n: number) => `$${n.toFixed(4)}`;
console.table(
  sorted.map((r) => ({
    model: r.model.replace("claude-", ""),
    effort: r.effort,
    agents: r.agents,
    "prompt tok": r.prompt,
    "output tok": r.output,
    cost: fmt(r.usd),
    "same tokens on opus": fmt(r.asOpus),
  })),
);
const total = sorted.reduce((s, r) => s + r.usd, 0);
const opus = sorted.reduce((s, r) => s + r.asOpus, 0);
console.log(`total ${fmt(total)}  |  same tokens on opus ${fmt(opus)}  |  difference ${fmt(opus - total)}`);
console.log("The opus column reprices the same tokens; a real Opus run would use a different number of tokens.");
if (unpriced) console.log(`${unpriced} message(s) from models without a price in PRICES were left out.`);
