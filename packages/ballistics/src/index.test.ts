import { describe, expect, it } from "vitest";
import { simulateShot, simulateBurst, armorEffectiveness, weaponSpec } from "./index.js";
import { M855, M995, PS_545, BP_545 } from "./__fixtures__/ammo.js";
import {
  PACA_C2,
  MF_UNTAR_C3,
  SIX_B13_C4,
  FORT_DEFENDER_C5,
  ZABRALO_C6,
} from "./__fixtures__/armor.js";
import { M4A1, CQR_GRIP, UBR_GEN2_STOCK, VP09_MUZZLE_BRAKE } from "./__fixtures__/weapons.js";

describe("public API integration", () => {
  it("simulateShot produces a deterministic result for a known matchup", () => {
    const result = simulateShot(M995, SIX_B13_C4, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(M995.damage);
    expect(result.armorDamage).toBeGreaterThan(0);
  });

  it("simulateBurst breaks PACA with M995 in the ground-truth shot count", () => {
    // Live PACA is class 2 / 100 durability / Aramid. WishGranter: 22 shots.
    const burst = simulateBurst(M995, PACA_C2, 30, 15);
    const breakAt = burst.findIndex((s) => s.remainingDurability <= 0);
    expect(breakAt).toBe(21); // zero-indexed → the 22nd shot
  });

  it("armorEffectiveness orders ammo correctly: M995 outperforms M855 across the board", () => {
    const armors = [PACA_C2, MF_UNTAR_C3, SIX_B13_C4, FORT_DEFENDER_C5];
    const matrix = armorEffectiveness([M855, M995], armors);
    for (let armorIndex = 0; armorIndex < armors.length; armorIndex++) {
      // M995 row [1] should be ≤ M855 row [0] for every armor
      expect(matrix[1][armorIndex]).toBeLessThanOrEqual(matrix[0][armorIndex]);
    }
  });

  it("ranks PS-545 as clearly worse than BP-545 against class 6, without either being unbreakable", () => {
    // This replaces an assertion that PS-545 vs class 6 was `Infinity`. Under the
    // ported formula the min-1 floor makes Infinity unreachable for any armor
    // with durability <= the shot cap, so the old expectation encoded the very
    // defect audit §G measured. The real signal — PS is much worse than BP — is
    // what gets asserted instead.
    const matrix: number[][] = armorEffectiveness([PS_545, BP_545], [ZABRALO_C6]);
    const ps = matrix[0]![0]!;
    const bp = matrix[1]![0]!;
    expect(Number.isFinite(ps)).toBe(true);
    expect(Number.isFinite(bp)).toBe(true);
    expect(ps).toBeGreaterThan(bp);
  });

  it("weaponSpec aggregates the M4A1 with three mods correctly", () => {
    const spec = weaponSpec(M4A1, [CQR_GRIP, UBR_GEN2_STOCK, VP09_MUZZLE_BRAKE]);
    expect(spec.weaponId).toBe(M4A1.id);
    expect(spec.modCount).toBe(3);
    expect(spec.ergonomics).toBe(48 + 15 + 8 - 2);
    // Real fractions: -0.23 + -0.225 + -0.085 = -0.54, a -54% build.
    expect(spec.verticalRecoil).toBeCloseTo(119 * 0.46, 4);
  });
});
