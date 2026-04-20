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
