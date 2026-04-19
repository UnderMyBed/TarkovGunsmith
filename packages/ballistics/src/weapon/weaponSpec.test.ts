import { describe, expect, it } from "vitest";
import { weaponSpec } from "./weaponSpec.js";
import type { BallisticWeapon, BallisticMod } from "../types.js";

const m4: BallisticWeapon = {
  id: "m4",
  name: "M4A1",
  baseErgonomics: 50,
  baseVerticalRecoil: 56,
  baseHorizontalRecoil: 220,
  baseWeight: 2.7,
  baseAccuracy: 3.5,
};

const grip: BallisticMod = {
  id: "grip-mk16",
  name: "MK16 Grip",
  ergonomicsDelta: 8,
  recoilModifierPercent: -3,
  weight: 0.05,
  accuracyDelta: 0,
};

const stock: BallisticMod = {
  id: "stock-buffertube",
  name: "Buffer Tube Stock",
  ergonomicsDelta: -2,
  recoilModifierPercent: -8,
  weight: 0.3,
  accuracyDelta: 0,
};

const muzzle: BallisticMod = {
  id: "muzzle-comp",
  name: "Compensator",
  ergonomicsDelta: -3,
  recoilModifierPercent: -15,
  weight: 0.1,
  accuracyDelta: -0.5,
};

describe("weaponSpec", () => {
  it("returns base stats when no mods are attached", () => {
    const spec = weaponSpec(m4, []);
    expect(spec.weaponId).toBe("m4");
    expect(spec.modCount).toBe(0);
    expect(spec.ergonomics).toBe(50);
    expect(spec.verticalRecoil).toBe(56);
    expect(spec.horizontalRecoil).toBe(220);
    expect(spec.weight).toBeCloseTo(2.7, 5);
    expect(spec.accuracy).toBe(3.5);
  });

  it("sums ergonomics deltas additively", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 50 + 8 + (-2) + (-3) = 53
    expect(spec.ergonomics).toBe(53);
  });

  it("applies recoil multipliers as (1 + sum/100) of base", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // sum = -3 + -8 + -15 = -26 → 56 * (1 - 0.26) = 41.44
    expect(spec.verticalRecoil).toBeCloseTo(41.44, 4);
    expect(spec.horizontalRecoil).toBeCloseTo(220 * 0.74, 4);
  });

  it("sums mod weights onto base weight", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 2.7 + 0.05 + 0.3 + 0.1 = 3.15
    expect(spec.weight).toBeCloseTo(3.15, 5);
  });

  it("sums accuracy deltas (lower is better)", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 3.5 + 0 + 0 + (-0.5) = 3.0
    expect(spec.accuracy).toBeCloseTo(3.0, 5);
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
});
