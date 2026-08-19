import { describe, expect, it } from "vitest";
import { simulateShot } from "./simulateShot.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

// Live-sampled values (json.tarkov.dev, 2026-08-19): 5.56x45mm M855 is
// penetrationPower 31, damage 54, armorDamage 37. Constructed locally rather
// than imported so the durability edge states below can be varied freely.
const m855: BallisticAmmo = {
  id: "54527a984bdc2d4e668b4567",
  name: "5.56x45mm M855",
  penetrationPower: 31,
  damage: 54,
  armorDamagePercent: 37,
  projectileCount: 1,
};

// Shaped after 6B13 assault armor: class 4, Aramid (destructibility 0.1875).
const class4Fresh: BallisticArmor = {
  id: "class4-fresh",
  name: "Class 4 (fresh)",
  armorClass: 4,
  maxDurability: 203,
  currentDurability: 203,
  materialDestructibility: 0.1875,
  zones: ["chest"],
};

// Shaped after MF-UNTAR: class 3, Aluminium (destructibility 0.45).
const class3Fresh: BallisticArmor = {
  id: "class3-fresh",
  name: "Class 3 (fresh)",
  armorClass: 3,
  maxDurability: 100,
  currentDurability: 100,
  materialDestructibility: 0.45,
  zones: ["chest"],
};

describe("simulateShot", () => {
  it("penetrates when penetration power overwhelms armor", () => {
    // M855 (pen 31) vs Class 3 fresh (effective 30). delta=1 → chance=1.
    const result = simulateShot(m855, class3Fresh, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(54);
    // Certain penetration → the penetrated branch alone:
    // 31 × 0.37 × clamp(31/3*10, 0.5, 0.9)=0.9 × 0.45 = 4.64535
    expect(result.armorDamage).toBeCloseTo(4.64535, 5);
    expect(result.remainingDurability).toBeCloseTo(100 - 4.64535, 5);
    expect(result.residualPenetration).toBe(31);
  });

  it("blends both branches when penetration is uncertain", () => {
    // M855 (pen 31) vs Class 4 fresh (effective 40). delta=-9 → chance = 0.4.
    // blocked    = 31 × 0.37 × 1.1 × 0.1875 = 2.3656875
    // penetrated = 31 × 0.37 × 0.9 × 0.1875 = 1.9355625
    // expected   = 0.4 × 1.9355625 + 0.6 × 2.3656875 = 2.1936375
    const result = simulateShot(m855, class4Fresh, 15);
    expect(result.didPenetrate).toBe(false);
    expect(result.damage).toBeLessThan(54);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.armorDamage).toBeCloseTo(2.1936375, 6);
  });

  it("damages armor more when the shot is more likely to be blocked", () => {
    // The old behaviour halved armor damage on a deflection. The ground truth
    // has the opposite sign — see docs/operations/data-api-audit.md §G.
    const certainPenetration = simulateShot(m855, class3Fresh, 15);
    const likelyBlocked = simulateShot(m855, class4Fresh, 15);
    const perDurabilityPoint = (r: { armorDamage: number }, destr: number) => r.armorDamage / destr;
    expect(perDurabilityPoint(likelyBlocked, 0.1875)).toBeGreaterThan(
      perDurabilityPoint(certainPenetration, 0.45),
    );
  });

  it("returns updated remainingDurability", () => {
    const result = simulateShot(m855, class4Fresh, 15);
    expect(result.remainingDurability).toBeCloseTo(
      class4Fresh.currentDurability - result.armorDamage,
      4,
    );
  });

  it("clamps remainingDurability to 0", () => {
    const almostBroken: BallisticArmor = { ...class4Fresh, currentDurability: 0.05 };
    const result = simulateShot(m855, almostBroken, 15);
    expect(result.remainingDurability).toBeGreaterThanOrEqual(0);
  });

  it("treats broken armor (durability 0) as no resistance", () => {
    const broken: BallisticArmor = { ...class4Fresh, currentDurability: 0 };
    const result = simulateShot(m855, broken, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(54);
  });
});
