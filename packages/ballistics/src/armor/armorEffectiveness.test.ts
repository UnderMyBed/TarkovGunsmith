import { describe, expect, it } from "vitest";
import { armorEffectiveness } from "./armorEffectiveness.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const ammos: BallisticAmmo[] = [
  {
    id: "ps",
    name: "5.45 PS",
    penetrationPower: 21,
    damage: 50,
    armorDamagePercent: 38,
    projectileCount: 1,
  },
  {
    id: "bp",
    name: "5.45 BP",
    penetrationPower: 40,
    damage: 50,
    armorDamagePercent: 50,
    projectileCount: 1,
  },
];

const armors: BallisticArmor[] = [
  {
    id: "class3",
    name: "C3",
    armorClass: 3,
    maxDurability: 50,
    currentDurability: 50,
    materialDestructibility: 0.5,
    zones: ["chest"],
  },
  {
    id: "class5",
    name: "C5",
    armorClass: 5,
    maxDurability: 80,
    currentDurability: 80,
    materialDestructibility: 0.45,
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

  it("returns Infinity when ammo can't kill armor within the cap", () => {
    // PS (pen 21) vs Class 5 (effective 50 fresh) — chance ≈ 0; armor takes
    // only deflection-half damage. PS armorDmg = 38*0.45/100/2 = 0.0855 per
    // deflected shot. 80/0.0855 ≈ 936 — well above the 500-shot default cap.
    const matrix = armorEffectiveness(ammos, armors);
    expect(matrix[0][1]).toBe(Number.POSITIVE_INFINITY);
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
