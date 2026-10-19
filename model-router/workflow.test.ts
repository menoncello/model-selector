import { beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as acorn from "acorn";

// store.ts writes the cache and log under the home directory; keep tests away from the real one.
process.env.MODEL_ROUTER_DIR = mkdtempSync(join(tmpdir(), "model-router-"));

const real = await import("./jev");
let calls = 0;
// Every call site gets opus/high, except prompts mentioning "list" which get haiku/low.
mock.module("./jev", () => ({
  ...real,
  askJev: async (state: any, questions: Record<string, unknown>) => {
    calls++;
    const answers: Record<string, unknown> = {};
    for (const id of Object.keys(questions)) {
      const site = id.replace(/_(model|effort)$/, "");
      const cheap = String(state.agent_calls[site]).includes("List");
      answers[id] = id.endsWith("_model")
        ? {
            choice: cheap ? "haiku" : "opus",
            probabilities: cheap ? { haiku: 1, sonnet: 0, opus: 0 } : { haiku: 0, sonnet: 0, opus: 1 },
          }
        : { score: cheap ? 0.1 : 2 };
    }
    return answers;
  },
}));

const { routeScript } = await import("./workflow");

beforeEach(() => {
  calls = 0;
});

const parses = (src: string) =>
  acorn.parse(src, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
  });

test("adds opts when the call has none", async () => {
  const { script } = await routeScript("const a = await agent('List the files in src/')");
  expect(script).toBe(`const a = await agent('List the files in src/', { model: "haiku", effort: "low" })`);
});

test("inserts into an object literal without touching existing keys", async () => {
  const { script } = await routeScript("await agent('Review the auth module', { label: 'x' })");
  expect(script).toBe(`await agent('Review the auth module', { model: "opus", effort: "high", label: 'x' })`);
});

test("wraps a non-literal opts so the variable still wins", async () => {
  const { script } = await routeScript("const o = {}; await agent(`Review ${f}`, o)");
  expect(script).toContain(`{ model: "opus", effort: "high", ...(o) }`);
});

test("leaves calls that already set model and effort alone", async () => {
  const src = "await agent('Rename foo', { model: 'haiku', effort: 'low' })";
  const { script, applied } = await routeScript(src);
  expect(script).toBe(src);
  expect(applied).toHaveLength(0);
});

test("only fills effort when model is explicit", async () => {
  const { script } = await routeScript("await agent('Design the cache layer', { model: 'sonnet' })");
  expect(script).toBe(`await agent('Design the cache layer', { effort: "high", model: 'sonnet' })`);
});

test("rewrites several calls in one Jev request and keeps the script valid", async () => {
  const src = [
    "export const meta = { name: 'x', description: 'y' }",
    "const files = await agent('List every file')",
    "const r = await pipeline(items, d => agent(d.prompt, { phase: 'Find' }))",
    "return await agent(`Synthesize ${r}`)",
  ].join("\n");
  const { script, applied } = await routeScript(src);
  expect(calls).toBe(1);
  expect(applied).toHaveLength(3);
  expect(() => parses(script)).not.toThrow();
});

test("uses the cache on the second run", async () => {
  const src = "await agent('List cached things')";
  await routeScript(src);
  await routeScript(src);
  expect(calls).toBe(1);
});
