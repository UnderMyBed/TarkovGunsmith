import { describe, expect, it } from "vitest";
import type { PlannedShot } from "@tarkov/ballistics";
import {
  type ScenarioState,
  initialScenarioState,
  scenarioReducer,
  PLAN_LENGTH_CAP,
} from "./scenarioReducer.js";

const shot = (zone: PlannedShot["zone"]): PlannedShot => ({ zone, distance: 15 });

describe("scenarioReducer — append", () => {
  it("appends to an empty plan", () => {
    const next = scenarioReducer(initialScenarioState, {
      type: "append",
      shot: shot("thorax"),
    });
    expect(next.plan).toEqual([shot("thorax")]);
    expect(next.lastResult).toBeNull();
  });

  it("appends preserving existing order", () => {
    const state: ScenarioState = {
      plan: [shot("head"), shot("thorax")],
      lastResult: null,
    };
    const next = scenarioReducer(state, { type: "append", shot: shot("leftLeg") });
    expect(next.plan.map((s) => s.zone)).toEqual(["head", "thorax", "leftLeg"]);
  });

  it("silently no-ops when the plan is at the length cap", () => {
    const full: ScenarioState = {
      plan: Array.from({ length: PLAN_LENGTH_CAP }, () => shot("stomach")),
      lastResult: null,
    };
    const next = scenarioReducer(full, { type: "append", shot: shot("head") });
    expect(next).toBe(full); // identity preserved
    expect(next.plan).toHaveLength(PLAN_LENGTH_CAP);
  });

  it("enforces the cap = 128 explicitly", () => {
    expect(PLAN_LENGTH_CAP).toBe(128);
  });
});

describe("scenarioReducer — move", () => {
  const base: ScenarioState = {
    plan: [shot("head"), shot("thorax"), shot("stomach")],
    lastResult: null,
  };

  it("moves an item forward", () => {
    const next = scenarioReducer(base, { type: "move", from: 0, to: 2 });
    expect(next.plan.map((s) => s.zone)).toEqual(["thorax", "stomach", "head"]);
  });

  it("moves an item backward", () => {
    const next = scenarioReducer(base, { type: "move", from: 2, to: 0 });
    expect(next.plan.map((s) => s.zone)).toEqual(["stomach", "head", "thorax"]);
  });

  it("no-ops when from === to", () => {
    const next = scenarioReducer(base, { type: "move", from: 1, to: 1 });
    expect(next).toBe(base);
  });

  it("no-ops when from is out of range", () => {
    expect(scenarioReducer(base, { type: "move", from: -1, to: 0 })).toBe(base);
    expect(scenarioReducer(base, { type: "move", from: 3, to: 0 })).toBe(base);
  });

  it("no-ops when to is out of range", () => {
    expect(scenarioReducer(base, { type: "move", from: 0, to: -1 })).toBe(base);
    expect(scenarioReducer(base, { type: "move", from: 0, to: 3 })).toBe(base);
  });
});

describe("scenarioReducer — remove", () => {
  const base: ScenarioState = {
    plan: [shot("head"), shot("thorax"), shot("stomach")],
    lastResult: null,
  };

  it("removes an item by index", () => {
    const next = scenarioReducer(base, { type: "remove", index: 1 });
    expect(next.plan.map((s) => s.zone)).toEqual(["head", "stomach"]);
  });

  it("handles removing the first item", () => {
    const next = scenarioReducer(base, { type: "remove", index: 0 });
    expect(next.plan.map((s) => s.zone)).toEqual(["thorax", "stomach"]);
  });

  it("handles removing the last item", () => {
    const next = scenarioReducer(base, { type: "remove", index: 2 });
    expect(next.plan.map((s) => s.zone)).toEqual(["head", "thorax"]);
  });

  it("no-ops on out-of-range index", () => {
    expect(scenarioReducer(base, { type: "remove", index: -1 })).toBe(base);
    expect(scenarioReducer(base, { type: "remove", index: 3 })).toBe(base);
  });
});

describe("scenarioReducer — clear", () => {
  it("resets plan and lastResult", () => {
    const state: ScenarioState = {
      plan: [shot("head"), shot("thorax")],
      lastResult: {
        shots: [],
        killed: false,
        killedAt: null,
      },
    };
    const next = scenarioReducer(state, { type: "clear" });
    expect(next.plan).toEqual([]);
    expect(next.lastResult).toBeNull();
  });

  it("returns the initial state sentinel equivalent", () => {
    const next = scenarioReducer(initialScenarioState, { type: "clear" });
    expect(next).toEqual(initialScenarioState);
  });
});
