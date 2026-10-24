import { describe, expect, test } from "bun:test";
import { CONFIG } from "./config";
import { capEffort, capTier, decide, effortFor, questionsFor } from "./jev";

const answers = (probabilities: Record<string, number>, score: number) => ({
  t_model: { choice: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0], probabilities },
  t_effort: { score },
});

describe("decide", () => {
  test("picks the most likely tier when it is the biggest candidate", () => {
    expect(decide(answers({ haiku: 0.05, sonnet: 0.9, opus: 0.05 }, 1), "t").model).toBe("sonnet");
  });

  test("goes up to a bigger tier that has at least 30%", () => {
    expect(decide(answers({ haiku: 0.6, sonnet: 0.35, opus: 0.05 }, 1), "t").model).toBe("sonnet");
  });

  test("does not go up to a tier near 0%", () => {
    expect(decide(answers({ haiku: 0.36, sonnet: 0.64, opus: 0 }, 1), "t").model).toBe("sonnet");
  });

  test.each([
    [0.2, "none"],
    [0.5, "low"],
    [1.0, "medium"],
    [2.0, "high"],
    [2.9, "xhigh"],
  ])("maps effort score %d to %s", (score, effort) => {
    expect(decide(answers({ haiku: 1, sonnet: 0, opus: 0 }, score), "t").effort).toBe(effort as any);
  });
});

test("maxTier caps bigger tiers and leaves smaller ones", () => {
  CONFIG.maxTier = "sonnet";
  try {
    expect(capTier("opus")).toBe("sonnet");
    expect(capTier("haiku")).toBe("haiku");
    expect(decide(answers({ haiku: 0, sonnet: 0.2, opus: 0.8 }, 1), "t").model).toBe("sonnet");
  } finally {
    CONFIG.maxTier = "opus";
  }
});

test("maxEffort caps bigger efforts and leaves smaller ones", () => {
  CONFIG.maxEffort = "medium";
  try {
    expect(capEffort("xhigh")).toBe("medium");
    expect(capEffort("low")).toBe("low");
    expect(decide(answers({ haiku: 1, sonnet: 0, opus: 0 }, 2.9), "t").effort).toBe("medium");
  } finally {
    CONFIG.maxEffort = "max";
  }
});

test("effort none is not sent", () => {
  expect(effortFor("sonnet", "none")).toBeUndefined();
});

test("effortFor passes effort through for every tier by default", () => {
  expect(effortFor("haiku", "low")).toBe("low");
});

test("questionsFor builds a model choice and an effort score", () => {
  const q = questionsFor("c0", "`agent_calls.c0`") as Record<string, any>;
  expect(q.c0_model.type).toBe("choice");
  expect(Object.keys(q.c0_model.criteria)).toEqual(["haiku", "sonnet", "opus"]);
  expect(q.c0_effort.type).toBe("score");
});
