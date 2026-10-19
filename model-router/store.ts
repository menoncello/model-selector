import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Decision } from "./jev";

// Shared across projects; every log entry records which project it came from.
// MODEL_ROUTER_DIR overrides the location (tests use it).
const dir = process.env.MODEL_ROUTER_DIR ?? join(homedir(), ".claude", "model-router");
const cacheFile = join(dir, "cache.json");
const logFile = join(dir, "decisions.jsonl");

mkdirSync(dir, { recursive: true });

const cache: Record<string, Decision> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};

export const hash = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex").slice(0, 16);

export const cached = (key: string) => cache[key];

export function remember(key: string, d: Decision) {
  cache[key] = d;
  writeFileSync(cacheFile, JSON.stringify(cache));
}

export function log(entry: Record<string, unknown>) {
  appendFileSync(
    logFile,
    `${JSON.stringify({
      at: new Date().toISOString(),
      project: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
      ...entry,
    })}\n`,
  );
}
