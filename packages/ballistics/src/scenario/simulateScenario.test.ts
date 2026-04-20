import { describe, expect, it } from "vitest";
import { simulateScenario } from "./simulateScenario.js";
import { createPmcTarget } from "./defaults.js";
import { M855 } from "../__fixtures__/ammo.js";
import type { ScenarioTarget } from "./types.js";

describe("simulateScenario — degenerate inputs", () => {
  it("returns empty result for empty plan", () => {
    const result = simulateScenario(M855, createPmcTarget(), []);
    expect(result.shots).toEqual([]);
    expect(result.killed).toBe(false);
    expect(result.killedAt).toBeNull();
  });

  it("returns empty result when thorax already at 0", () => {
    const base = createPmcTarget();
    const dead: ScenarioTarget = {
      ...base,
      parts: {
        ...base.parts,
        thorax: { ...base.parts.thorax, hp: 0, blacked: true },
      },
    };
    const result = simulateScenario(M855, dead, [{ zone: "thorax", distance: 15 }]);
    expect(result.shots).toEqual([]);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBeNull();
  });

  it("returns empty result when head already at 0", () => {
    const base = createPmcTarget();
    const dead: ScenarioTarget = {
      ...base,
      parts: {
        ...base.parts,
        head: { ...base.parts.head, hp: 0, blacked: true },
      },
    };
    const result = simulateScenario(M855, dead, [{ zone: "head", distance: 15 }]);
    expect(result.shots).toEqual([]);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBeNull();
  });
});
