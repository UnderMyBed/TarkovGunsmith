import { describe, expect, it } from "vitest";
import { simulateScenario } from "./simulateScenario.js";
import { createPmcTarget } from "./defaults.js";
import { M855, M995 } from "../__fixtures__/ammo.js";
import { TEST_BODY_ARMOR, TEST_HELMET } from "./__fixtures__/targets.js";
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

describe("simulateScenario — body armor", () => {
  it("routes thorax shots through body armor when matching", () => {
    const target = { ...createPmcTarget(), bodyArmor: TEST_BODY_ARMOR };
    const result = simulateScenario(M995, target, [{ zone: "thorax", distance: 15 }]);
    expect(result.shots[0]!.armorUsed).toBe("bodyArmor");
  });

  it("chains armor durability across shots", () => {
    // Use stomach (not thorax) so the 3-shot plan completes: stomach kills are
    // non-fatal (only head/thorax zero triggers kill), so all 3 shots execute
    // and we can verify that armor durability decreases monotonically.
    const target = { ...createPmcTarget(), bodyArmor: { ...TEST_BODY_ARMOR } };
    const result = simulateScenario(M995, target, [
      { zone: "stomach", distance: 15 },
      { zone: "stomach", distance: 15 },
      { zone: "stomach", distance: 15 },
    ]);
    const [a, b, c] = result.shots;
    expect(a!.remainingDurability).toBeLessThan(TEST_BODY_ARMOR.maxDurability);
    expect(b!.remainingDurability).toBeLessThanOrEqual(a!.remainingDurability);
    expect(c!.remainingDurability).toBeLessThanOrEqual(b!.remainingDurability);
  });

  it("does not mutate the caller's bodyArmor durability", () => {
    const armor = { ...TEST_BODY_ARMOR };
    const target = { ...createPmcTarget(), bodyArmor: armor };
    const before = armor.currentDurability;
    simulateScenario(M995, target, [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    expect(armor.currentDurability).toBe(before);
  });

  it("bypasses armor on zones the armor doesn't cover (e.g. legs)", () => {
    const target = { ...createPmcTarget(), bodyArmor: TEST_BODY_ARMOR };
    const result = simulateScenario(M995, target, [{ zone: "leftLeg", distance: 15 }]);
    expect(result.shots[0]!.armorUsed).toBeNull();
  });
});

describe("simulateScenario — termination and plan handling", () => {
  it("stops executing shots after the fatal one", () => {
    const plan = Array.from({ length: 50 }, () => ({
      zone: "thorax" as const,
      distance: 15,
    }));
    const result = simulateScenario(M855, createPmcTarget(), plan);
    expect(result.killed).toBe(true);
    expect(result.shots.length).toBeLessThan(plan.length);
    // Only the last recorded shot is marked killed.
    const killedFlags = result.shots.map((s) => s.killed);
    expect(killedFlags.filter(Boolean)).toHaveLength(1);
    expect(killedFlags[killedFlags.length - 1]).toBe(true);
  });

  it("never kills on arms / legs alone", () => {
    const plan = Array.from({ length: 100 }, () => ({
      zone: "leftLeg" as const,
      distance: 15,
    }));
    const result = simulateScenario(M855, createPmcTarget(), plan);
    expect(result.killed).toBe(false);
    expect(result.killedAt).toBeNull();
    // Leg went to zero (blacked) but no death.
    const last = result.shots[result.shots.length - 1]!;
    expect(last.bodyAfter.leftLeg.blacked).toBe(true);
  });

  it("handles mixed-zone plans picking the right armor per shot", () => {
    const target: ScenarioTarget = {
      ...createPmcTarget(),
      helmet: TEST_HELMET,
      bodyArmor: TEST_BODY_ARMOR,
    };
    const result = simulateScenario(M855, target, [
      { zone: "thorax", distance: 15 },
      { zone: "leftLeg", distance: 15 },
      { zone: "head", distance: 15 },
    ]);
    expect(result.shots[0]!.armorUsed).toBe("bodyArmor");
    expect(result.shots[1]!.armorUsed).toBeNull();
    expect(result.shots[2]!.armorUsed).toBe("helmet");
  });

  it("does not mutate the caller's body parts object", () => {
    const target = createPmcTarget();
    const snapshot = structuredClone(target.parts);
    simulateScenario(M855, target, [
      { zone: "thorax", distance: 15 },
      { zone: "leftLeg", distance: 15 },
    ]);
    expect(target.parts).toEqual(snapshot);
  });

  it("produces independent bodyAfter snapshots per shot", () => {
    const result = simulateScenario(M855, createPmcTarget(), [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    const first = result.shots[0]!.bodyAfter.thorax.hp;
    const second = result.shots[1]!.bodyAfter.thorax.hp;
    expect(second).toBeLessThan(first);
    // First snapshot wasn't mutated by the second shot.
    expect(first).toBe(85 - M855.damage);
  });
});
