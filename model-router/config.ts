export type Tier = "haiku" | "sonnet" | "opus";
// "none" means the hook sends no effort and the subagent runs at its default.
export type Effort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export const CONFIG = {
  endpoint: "https://api.typesafe.ai/v1/systemone",
  jevModel: "jev-latest",
  timeoutMs: 2500,

  // Pick the biggest tier with at least this probability: when Jev is torn between two tiers,
  // redoing bad work costs more than the bigger model. A tier near 0% is never picked.
  minTierProbability: 0.3,

  // Jev's effort Score runs 0..3. Each entry is [upper bound (exclusive), effort].
  effortThresholds: [
    [0.25, "none"],
    [0.75, "low"],
    [1.5, "medium"],
    [2.3, "high"],
    [Infinity, "xhigh"],
  ] as [number, Effort][],

  // Ceiling: any tier above this becomes this tier. Env MODEL_ROUTER_MAX_TIER overrides; "opus" means no cap.
  maxTier: (process.env.MODEL_ROUTER_MAX_TIER ?? "opus") as Tier,

  // Ceiling on reasoning: any effort above this becomes this effort. Env MODEL_ROUTER_MAX_EFFORT overrides; "max" means no cap.
  maxEffort: (process.env.MODEL_ROUTER_MAX_EFFORT ?? "max") as Effort,

  // Don't send effort to these tiers. Haiku, Sonnet and Opus 5.5 accept every level.
  skipEffortFor: [] as Tier[],

  // Agent subagent_types the hook leaves untouched.
  skipSubagentTypes: ["fork"],

  maxPromptChars: 12_000,
  maxScriptChars: 40_000,
  maxSnippetChars: 2_000,
};

export const TIER_CRITERIA: Record<Tier, string> = {
  haiku:
    "Mechanical, fully specified work where little can go wrong: searching or reading files, listing things, renaming, applying an edit that is already decided, running a command and reporting its output, short summaries.",
  sonnet:
    "Ordinary engineering: implementing a feature or fixing a bug from a clear plan, writing tests, reviewing a diff for common bugs, moderate judgment across a few files.",
  opus: "Hard or high-stakes work: architecture and design decisions, subtle or concurrency bugs, security, ambiguous requirements, adversarial verification of tricky claims, synthesis across many sources, large refactors with many interacting parts.",
};

export const EFFORT_CRITERIA = [
  "Trivial: the answer or action is obvious, no thinking needed",
  "Some thought: a few straightforward steps",
  "Careful multi-step reasoning: several dependent steps or things to check",
  "Deep reasoning: many tradeoffs, hidden pitfalls, or easy to get subtly wrong",
];
