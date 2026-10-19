import { CONFIG, EFFORT_CRITERIA, type Effort, TIER_CRITERIA, type Tier } from "./config";

export type Decision = {
  model: Tier;
  effort: Effort; // apply with effortFor(): some tiers skip it
  confidence: number;
  score: number;
  probabilities: Record<string, number>;
};

const TIERS: Tier[] = ["haiku", "sonnet", "opus"];

// `ref` is a backticked path into the request state, e.g. `task` or `agent_calls.c0`.
export function questionsFor(id: string, ref: string) {
  return {
    [`${id}_model`]: {
      type: "choice",
      instructions: `Which Claude model tier should run the subagent work described in ${ref}? Pick the cheapest tier that will still do it well.`,
      criteria: TIER_CRITERIA,
    },
    [`${id}_effort`]: {
      type: "score",
      instructions: `How much reasoning does the subagent work described in ${ref} need?`,
      criteria: EFFORT_CRITERIA,
    },
  };
}

export async function askJev(state: unknown, questions: Record<string, unknown>) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY not set");
  const res = await fetch(CONFIG.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, model: CONFIG.jevModel, questions }),
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
  return (await res.json()).answers as Record<string, any>;
}

export function decide(answers: Record<string, any>, id: string): Decision {
  const m = answers[`${id}_model`];
  const e = answers[`${id}_effort`];
  const p = m.probabilities as Record<Tier, number>;
  const model = [...TIERS].reverse().find((t) => p[t] >= CONFIG.minTierProbability) ?? (m.choice as Tier);
  const score = e.score as number;
  const effort = CONFIG.effortThresholds.find(([max]) => score < max)![1];
  return { model, effort, confidence: m.confidence, score, probabilities: m.probabilities };
}

export const effortFor = (model: Tier, effort: Effort) => (CONFIG.skipEffortFor.includes(model) ? undefined : effort);
