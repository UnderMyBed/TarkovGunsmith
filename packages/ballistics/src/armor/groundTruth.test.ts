import { describe, expect, it } from "vitest";
import { armorEffectiveness } from "./armorEffectiveness.js";
import { BT_545, M995 } from "../__fixtures__/ammo.js";
import { PACA_C2, SIX_B13_C4, ZABRALO_C6 } from "../__fixtures__/armor.js";

/**
 * Regression pins against an INDEPENDENT implementation — the original
 * WishGranter `Ballistics.cs`, not our own output. This is the check the
 * previous suite structurally could not make: every fixture it used was
 * invented, so it could only ever confirm that the code agreed with itself.
 *
 * Reference figures are recorded in docs/operations/data-api-audit.md §G and
 * were reproduced here by running a direct port of `GetExpectedArmorDamage`
 * against the live items document (2026-08-19), using the same live-sampled
 * ammo and armor values the fixtures now carry.
 */
const GROUND_TRUTH = [
  { label: "M995 → 6B13 (class 4, 203 dur)", ammo: M995, armor: SIX_B13_C4, shots: 44 },
  { label: "M995 → Zabralo-Sh (class 6, 510 dur)", ammo: M995, armor: ZABRALO_C6, shots: 104 },
  { label: "M995 → PACA (class 2, 100 dur)", ammo: M995, armor: PACA_C2, shots: 22 },
  { label: "5.45 BT → Zabralo-Sh", ammo: BT_545, armor: ZABRALO_C6, shots: 161 },
] as const;

/**
 * Our `penetrationChance` is a linear ramp; the original derives a `factor_a`
 * curve. Audit §G measured that divergence and scoped it to a separate change,
 * so it remains the one source of residual error here. Measured across the full
 * live matrix it is 1.75% mean relative error; on these four pairs it is at
 * most 4.8%. The 6% band asserts the durability port is faithful while leaving
 * exactly that known gap — it is not slack for a future regression.
 */
const PEN_CHANCE_TOLERANCE = 0.06;

describe("armor durability vs WishGranter ground truth", () => {
  it.each(GROUND_TRUTH)("breaks $label in ~$shots shots", ({ ammo, armor, shots }) => {
    const [[actual]] = armorEffectiveness([ammo], [armor]);
    expect(Number.isFinite(actual)).toBe(true);
    expect(Math.abs(actual - shots) / shots).toBeLessThanOrEqual(PEN_CHANCE_TOLERANCE);
  });

  it("matches ground truth exactly where penetrationChance agrees", () => {
    // These two pairs sit where the linear ramp and factor_a curve coincide, so
    // no tolerance is needed and none is given.
    const vs6B13: number = armorEffectiveness([M995], [SIX_B13_C4])[0]![0]!;
    const vsPaca: number = armorEffectiveness([M995], [PACA_C2])[0]![0]!;
    expect(vs6B13).toBe(44);
    expect(vsPaca).toBe(22);
  });

  it("no longer reports any live-shaped pair as unbreakable", () => {
    // Before the port, 97.9% of the live matrix returned Infinity. The min-1
    // floor makes that unreachable for any armor with durability <= the cap.
    const ammos = [M995, BT_545];
    const armors = [PACA_C2, SIX_B13_C4, ZABRALO_C6];
    for (const row of armorEffectiveness(ammos, armors)) {
      for (const cell of row) expect(Number.isFinite(cell)).toBe(true);
    }
  });
});
