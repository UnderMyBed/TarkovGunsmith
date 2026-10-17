import { describe, expect, it } from "vitest";
import { weaponSpec } from "./weaponSpec.js";
import type { BallisticMod } from "../types.js";
import {
  AR15_BARREL_10_3,
  CQR_GRIP as grip,
  HAMR_SCOPE,
  M4A1 as m4,
  UBR_GEN2_STOCK as stock,
  VP09_MUZZLE_BRAKE as muzzle,
} from "../__fixtures__/weapons.js";

// Every value below is sampled from the live json.tarkov.dev items document rather than
// invented (see the fixtures file). Invented percent-scale magnitudes are precisely what let
// the 100x recoil unit error survive for years — see docs/operations/data-api-audit.md §B.

describe("weaponSpec", () => {
  it("returns base stats when no mods are attached", () => {
    const spec = weaponSpec(m4, []);
    expect(spec.weaponId).toBe("5447a9cd4bdc2dbd208b4567");
    expect(spec.modCount).toBe(0);
    expect(spec.ergonomics).toBe(48);
    expect(spec.verticalRecoil).toBe(119);
    expect(spec.horizontalRecoil).toBe(342);
    expect(spec.weight).toBeCloseTo(0.75, 5);
    expect(spec.fireRate).toBe(800);
    expect(spec.effectiveDistance).toBe(500);
    expect(spec.sightingRange).toBe(100);
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
    // No measured build reaches this (the deepest is 0.022). Driven synthetically so the
    // guard stays covered if upstream ever widens the mod pool.
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
});

describe("weaponSpec accuracy (MOA)", () => {
  it("adds the barrel's centerOfImpact to the weapon's, at 100/2.9089 MOA per cm", () => {
    const spec = weaponSpec(m4, [AR15_BARREL_10_3]);
    // (0.01 + 0.07) × barrelDeviation(1.35, 22) × 100 / 2.9089 = 2.750228. Upstream
    // publishes 2.75 for the M4A1 SOPMOD II preset, which carries this barrel.
    expect(spec.baseMoa).toBeCloseTo(2.750228, 5);
    expect(spec.accuracyModifier).toBe(0);
    expect(spec.accuracy).toBeCloseTo(spec.baseMoa, 12);
  });

  it("reads the bare weapon's own centerOfImpact with the default deviationMax of 100", () => {
    // 0.01 × barrelDeviation(1.35, 100) × 100 / 2.9089.
    expect(weaponSpec(m4, []).baseMoa).toBeCloseTo(0.343779, 5);
  });

  it("skips a deviationMax of 0, as upstream's truthiness check does", () => {
    const zeroed = weaponSpec(m4, [{ ...AR15_BARREL_10_3, deviationMax: 0 }]);
    // Falls back to 100: (0.01 + 0.07) × barrelDeviation(1.35, 100) × 100 / 2.9089.
    expect(zeroed.baseMoa).toBeCloseTo(2.750228, 3);
    expect(zeroed.baseMoa).toBeGreaterThan(weaponSpec(m4, [AR15_BARREL_10_3]).baseMoa);
  });

  it("applies accuracy modifiers as (1 − sum), a positive modifier tightening MOA", () => {
    const spec = weaponSpec(m4, [AR15_BARREL_10_3, grip, stock, muzzle]);
    // Only the VP-09 carries one: +0.04 = 4% better, so 2.750228 × 0.96.
    expect(spec.accuracyModifier).toBeCloseTo(0.04, 12);
    expect(spec.accuracy).toBeCloseTo(2.640219, 5);
    expect(spec.accuracy).toBeLessThan(spec.baseMoa);
  });

  it("treats a negative accuracyModifier (suppressor) as worse MOA", () => {
    // Mosin Bramit suppressor reports accuracyModifier -0.05.
    const suppressor: BallisticMod = { ...muzzle, id: "bramit", accuracyModifier: -0.05 };
    const spec = weaponSpec(m4, [AR15_BARREL_10_3, suppressor]);
    // 2.750228 × 1.05 — MOA grows, i.e. accuracy degrades.
    expect(spec.accuracy).toBeCloseTo(2.887739, 5);
    expect(spec.accuracy).toBeGreaterThan(spec.baseMoa);
  });
});

describe("weaponSpec velocity, range and fire rate", () => {
  it("applies velocity modifiers as percents to the default ammo's speed", () => {
    const spec = weaponSpec(m4, [AR15_BARREL_10_3, grip]);
    // M4A1 0% + 10.3" barrel -11% → 922 × 0.89.
    expect(spec.velocityModifier).toBe(-11);
    expect(spec.muzzleVelocity).toBeCloseTo(820.58, 6);
    expect(spec.muzzleVelocityAmmo).toBe("M855");
  });

  it("has no muzzle velocity without a default ammo, and still sums the modifier", () => {
    const spec = weaponSpec({ ...m4, velocity: 1.8, defaultAmmo: null }, [AR15_BARREL_10_3]);
    expect(spec.velocityModifier).toBeCloseTo(-9.2, 12);
    expect(spec.muzzleVelocity).toBeNull();
    expect(spec.muzzleVelocityAmmo).toBeNull();
  });

  it("takes the longest sighting range of the weapon and its sights", () => {
    expect(weaponSpec(m4, [grip]).sightingRange).toBe(100);
    expect(weaponSpec(m4, [grip, HAMR_SCOPE]).sightingRange).toBe(800);
    // Upstream reports 0 for some reflex sights: never shorter than the weapon's own.
    expect(weaponSpec(m4, [{ ...HAMR_SCOPE, sightingRange: 0 }]).sightingRange).toBe(100);
  });

  it("passes fire rate and effective distance through: no part modifies them", () => {
    const spec = weaponSpec(m4, [AR15_BARREL_10_3, HAMR_SCOPE, grip]);
    expect(spec.fireRate).toBe(800);
    expect(spec.effectiveDistance).toBe(500);
  });
});
