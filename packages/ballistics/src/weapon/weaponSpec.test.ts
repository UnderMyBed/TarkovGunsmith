import { describe, expect, it } from "vitest";
import { weaponSpec } from "./weaponSpec.js";
import type { BallisticWeapon, BallisticMod } from "../types.js";

// Every value below is sampled from the live json.tarkov.dev items document
// (2026-08-19) rather than invented. Invented percent-scale magnitudes are
// precisely what let the 100x recoil unit error survive for years — see
// docs/operations/data-api-audit.md §B.

// Colt M4A1 5.56x45 assault rifle — 5447a9cd4bdc2dbd208b4567.
// baseAccuracy has no upstream counterpart; 3.5 mirrors DEFAULT_BASE_ACCURACY
// in apps/web/src/features/data-adapters/adapters.ts.
const m4: BallisticWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "M4A1",
  baseErgonomics: 48,
  baseVerticalRecoil: 119,
  baseHorizontalRecoil: 342,
  baseWeight: 0.75,
  baseAccuracy: 3.5,
};

// AR-15 Hera Arms CQR pistol grip/buttstock — 5a33e75ac4a2826c6e06d759.
const grip: BallisticMod = {
  id: "5a33e75ac4a2826c6e06d759",
  name: "CQR AR15",
  ergonomicsDelta: 15,
  recoilModifier: -0.23,
  weight: 0.499,
  accuracyModifier: 0,
};

// AR-15 Magpul UBR GEN2 stock (Black) — 5947e98b86f774778f1448bc.
const stock: BallisticMod = {
  id: "5947e98b86f774778f1448bc",
  name: "UBR GEN2",
  ergonomicsDelta: 8,
  recoilModifier: -0.225,
  weight: 0.61,
  accuracyModifier: 0,
};

// AR-15 Vendetta Precision VP-09 Interceptor 5.56x45 muzzle brake —
// 5a7c147ce899ef00150bd8b8. Carries a real positive accuracyModifier.
const muzzle: BallisticMod = {
  id: "5a7c147ce899ef00150bd8b8",
  name: "VP-09",
  ergonomicsDelta: -2,
  recoilModifier: -0.085,
  weight: 0.2,
  accuracyModifier: 0.04,
};

describe("weaponSpec", () => {
  it("returns base stats when no mods are attached", () => {
    const spec = weaponSpec(m4, []);
    expect(spec.weaponId).toBe("5447a9cd4bdc2dbd208b4567");
    expect(spec.modCount).toBe(0);
    expect(spec.ergonomics).toBe(48);
    expect(spec.verticalRecoil).toBe(119);
    expect(spec.horizontalRecoil).toBe(342);
    expect(spec.weight).toBeCloseTo(0.75, 5);
    expect(spec.accuracy).toBe(3.5);
  });

  it("sums ergonomics deltas additively", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 48 + 15 + 8 + (-2) = 69
    expect(spec.ergonomics).toBe(69);
  });

  it("applies recoil modifiers as (1 + sum) of base, treating them as fractions", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // sum = -0.23 + -0.225 + -0.085 = -0.54, i.e. a real -54% build.
    // 119 * 0.46 = 54.74; 342 * 0.46 = 157.32.
    expect(spec.verticalRecoil).toBeCloseTo(54.74, 4);
    expect(spec.horizontalRecoil).toBeCloseTo(157.32, 4);
  });

  it("sums mod weights onto base weight", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 0.75 + 0.499 + 0.61 + 0.2 = 2.059
    expect(spec.weight).toBeCloseTo(2.059, 5);
  });

  it("applies accuracy modifiers multiplicatively, positive modifier tightening MOA", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // Only the VP-09 has a non-zero accuracyModifier: +0.04 = 4% better
    // accuracy, so MOA drops. 3.5 * (1 - 0.04) = 3.36.
    expect(spec.accuracy).toBeCloseTo(3.36, 5);
  });

  it("reports modCount accurately", () => {
    expect(weaponSpec(m4, []).modCount).toBe(0);
    expect(weaponSpec(m4, [grip]).modCount).toBe(1);
    expect(weaponSpec(m4, [grip, stock, muzzle]).modCount).toBe(3);
  });

  it("does not mutate the caller's mods array", () => {
    const mods = [grip, stock, muzzle];
    const before = [...mods];
    weaponSpec(m4, mods);
    expect(mods).toEqual(before);
  });

  it("floors the recoil multiplier so recoil can never reach zero or go negative", () => {
    // No live weapon can reach this: the deepest measured multiplier is 0.062
    // and it saturates with depth. Driven synthetically so the guard is still
    // covered if upstream ever widens the mod pool.
    const absurd: BallisticMod[] = Array.from({ length: 6 }, (_, i) => ({
      ...grip,
      id: `absurd-${i}`,
      recoilModifier: -0.35,
    }));
    const spec = weaponSpec(m4, absurd);
    // Raw sum is -2.1, so 1 + sum = -1.1 — negative recoil without the floor.
    expect(spec.verticalRecoil).toBeCloseTo(119 * 0.01, 6);
    expect(spec.horizontalRecoil).toBeCloseTo(342 * 0.01, 6);
    expect(spec.verticalRecoil).toBeGreaterThan(0);
  });

  it("treats a negative accuracyModifier (suppressor) as worse MOA", () => {
    // Mosin Bramit suppressor reports accuracyModifier -0.05.
    const suppressor: BallisticMod = { ...muzzle, id: "bramit", accuracyModifier: -0.05 };
    const spec = weaponSpec(m4, [suppressor]);
    // 3.5 * (1 + 0.05) = 3.675 — MOA grows, i.e. accuracy degrades.
    expect(spec.accuracy).toBeCloseTo(3.675, 5);
    expect(spec.accuracy).toBeGreaterThan(m4.baseAccuracy);
  });
});
