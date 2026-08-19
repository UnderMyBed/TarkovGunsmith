import { describe, expect, it } from "vitest";
import { armorEffectiveness } from "./armorEffectiveness.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const ammos: BallisticAmmo[] = [
  {
    id: "ps",
    name: "5.45 PS",
    penetrationPower: 28,
    damage: 56,
    armorDamagePercent: 40,
    projectileCount: 1,
  },
  {
    id: "bp",
    name: "5.45 BP",
    penetrationPower: 45,
    damage: 48,
    armorDamagePercent: 46,
    projectileCount: 1,
  },
];

const armors: BallisticArmor[] = [
  {
    id: "class3",
    name: "C3",
    armorClass: 3,
    maxDurability: 100,
    currentDurability: 100,
    materialDestructibility: 0.45,
    zones: ["chest"],
  },
  {
    id: "class5",
    name: "C5",
    armorClass: 5,
    maxDurability: 320,
    currentDurability: 320,
    materialDestructibility: 0.525,
    zones: ["chest"],
  },
];

describe("armorEffectiveness", () => {
  it("returns a matrix of dimensions [ammos.length][armors.length]", () => {
    const matrix = armorEffectiveness(ammos, armors);
    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(2);
    expect(matrix[1]).toHaveLength(2);
  });

  it("returns finite shots-to-kill for ammo that can defeat the armor", () => {
    const matrix = armorEffectiveness(ammos, armors);
    // BP penetrates Class 3 fresh trivially, so should be a small finite count.
    expect(Number.isFinite(matrix[1][0])).toBe(true);
    expect(matrix[1][0]).toBeGreaterThan(0);
  });

  it("returns Infinity only when the cap is genuinely too low", () => {
    // This previously asserted Infinity for PS vs class 5 and spelled out the
    // defective arithmetic in its own comment. Under the ported formula the
    // min-1 floor bounds shots-to-break by the armor's durability, so Infinity
    // is unreachable whenever durability <= cap. It is still reachable with a
    // deliberately small cap, which is the only thing worth asserting now.
    // See docs/operations/data-api-audit.md §G.
    expect(armorEffectiveness(ammos, armors)[0][1]).toBeLessThanOrEqual(320);
    expect(Number.isFinite(armorEffectiveness(ammos, armors)[0][1])).toBe(true);
    expect(armorEffectiveness(ammos, armors, 3)[0][1]).toBe(Number.POSITIVE_INFINITY);
  });

  it("higher-pen ammo kills armor in fewer shots than lower-pen ammo (when both can)", () => {
    const matrix = armorEffectiveness(ammos, armors);
    expect(matrix[1][0]).toBeLessThanOrEqual(matrix[0][0]);
  });

  it("does not mutate caller's input arrays or objects", () => {
    const ammosBefore = JSON.parse(JSON.stringify(ammos)) as BallisticAmmo[];
    const armorsBefore = JSON.parse(JSON.stringify(armors)) as BallisticArmor[];
    armorEffectiveness(ammos, armors);
    expect(ammos).toEqual(ammosBefore);
    expect(armors).toEqual(armorsBefore);
  });

  it("returns empty matrix for empty inputs", () => {
    expect(armorEffectiveness([], armors)).toEqual([]);
    expect(armorEffectiveness(ammos, [])).toEqual([[], []]);
  });
});
