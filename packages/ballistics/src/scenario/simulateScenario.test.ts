import { describe, expect, it } from "vitest";
import { simulateScenario } from "./simulateScenario.js";
import { createPmcTarget } from "./defaults.js";
import { M855, M995 } from "../__fixtures__/ammo.js";
import { TEST_HELMET } from "./__fixtures__/targets.js";
import type { ScenarioTarget } from "./types.js";

describe("simulateScenario — bare flesh", () => {
  it("applies full ammo damage to an unarmored zone", () => {
    const result = simulateScenario(M855, createPmcTarget(), [{ zone: "leftLeg", distance: 15 }]);
    expect(result.shots).toHaveLength(1);
    const shot = result.shots[0]!;
    expect(shot.zone).toBe("leftLeg");
    expect(shot.armorUsed).toBeNull();
    expect(shot.didPenetrate).toBe(true);
    expect(shot.damage).toBe(M855.damage); // 49
    expect(shot.armorDamage).toBe(0);
    expect(shot.bodyAfter.leftLeg.hp).toBe(65 - 49);
    expect(shot.bodyAfter.leftLeg.blacked).toBe(false);
    expect(shot.killed).toBe(false);
  });

  it("marks a body part blacked when hp reaches 0", () => {
    // 2× thorax to a bare PMC with M855 (49 dmg) empties thorax (85 hp).
    const result = simulateScenario(M855, createPmcTarget(), [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    expect(result.shots).toHaveLength(2);
    const last = result.shots[1]!;
    expect(last.bodyAfter.thorax.hp).toBe(0);
    expect(last.bodyAfter.thorax.blacked).toBe(true);
    expect(last.killed).toBe(true);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBe(1);
  });

  it("clamps hp at 0 even on overkill", () => {
    // One head shot with M855 (49 dmg) vs 35 hp bare head → clamped to 0.
    const result = simulateScenario(M855, createPmcTarget(), [{ zone: "head", distance: 15 }]);
    const shot = result.shots[0]!;
    expect(shot.bodyAfter.head.hp).toBe(0);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBe(0);
  });
});

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

describe("simulateScenario — helmet", () => {
  it("routes head shots through the helmet when present and matching", () => {
    const target = { ...createPmcTarget(), helmet: TEST_HELMET };
    const result = simulateScenario(M995, target, [{ zone: "head", distance: 15 }]);
    const shot = result.shots[0]!;
    expect(shot.armorUsed).toBe("helmet");
    // M995 (pen 53) easily pens class-4 fresh helmet → full damage expected.
    expect(shot.didPenetrate).toBe(true);
    expect(shot.damage).toBe(M995.damage);
  });

  it("does not mutate the caller's helmet durability", () => {
    const target = { ...createPmcTarget(), helmet: { ...TEST_HELMET } };
    const before = target.helmet.currentDurability;
    simulateScenario(M995, target, [
      { zone: "head", distance: 15 },
      { zone: "head", distance: 15 },
    ]);
    expect(target.helmet.currentDurability).toBe(before);
  });

  it("leaves a non-matching helmet (zones=[]) out of the path", () => {
    const weirdHelmet = { ...TEST_HELMET, zones: [] as readonly string[] };
    const target = { ...createPmcTarget(), helmet: weirdHelmet };
    const result = simulateScenario(M995, target, [{ zone: "head", distance: 15 }]);
    expect(result.shots[0]!.armorUsed).toBeNull();
  });
});
