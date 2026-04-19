import { describe, expect, it } from "vitest";
import { simulateShot, simulateBurst, armorEffectiveness, weaponSpec } from "./index.js";
import { M855, M995, PS_545, BP_545 } from "./__fixtures__/ammo.js";
import { PACA_C3, KORD_C4, HEXGRID_C5, SLICK_C6 } from "./__fixtures__/armor.js";
import { M4A1, MK16_GRIP, BUFFER_STOCK, COMPENSATOR } from "./__fixtures__/weapons.js";

describe("public API integration", () => {
  it("simulateShot produces a deterministic result for a known matchup", () => {
    const result = simulateShot(M995, KORD_C4, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(M995.damage);
    expect(result.armorDamage).toBeGreaterThan(0);
  });

  it("simulateBurst breaks Class 3 armor with M995 in a small number of shots", () => {
    // PACA_C3 has 40 durability; M995 deals ~0.352 per shot → ~114 shots to break.
    const burst = simulateBurst(M995, PACA_C3, 120, 15);
    const breakAt = burst.findIndex((s) => s.remainingDurability <= 0);
    expect(breakAt).toBeGreaterThan(-1);
    expect(breakAt).toBeLessThan(120);
  });

  it("armorEffectiveness orders ammo correctly: M995 outperforms M855 across the board", () => {
    const matrix = armorEffectiveness([M855, M995], [PACA_C3, KORD_C4, HEXGRID_C5, SLICK_C6]);
    for (let armorIndex = 0; armorIndex < 4; armorIndex++) {
      // M995 row [1] should be ≤ M855 row [0] for every armor
      expect(matrix[1][armorIndex]).toBeLessThanOrEqual(matrix[0][armorIndex]);
    }
  });

  it("armorEffectiveness shows PS-545 as effectively useless against Class 6 (Infinity)", () => {
    const matrix = armorEffectiveness([PS_545, BP_545], [SLICK_C6]);
    expect(matrix[0][0]).toBe(Number.POSITIVE_INFINITY);
  });

  it("weaponSpec aggregates the M4A1 with three mods correctly", () => {
    const spec = weaponSpec(M4A1, [MK16_GRIP, BUFFER_STOCK, COMPENSATOR]);
    expect(spec.weaponId).toBe(M4A1.id);
    expect(spec.modCount).toBe(3);
    expect(spec.ergonomics).toBe(50 + 8 - 2 - 3);
    expect(spec.verticalRecoil).toBeCloseTo(56 * (1 - 0.26), 4);
  });
});
