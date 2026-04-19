import { describe, expect, it } from "vitest";
import { simulateShot } from "./simulateShot.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const m855: BallisticAmmo = {
  id: "m855",
  name: "M855",
  penetrationPower: 31,
  damage: 49,
  armorDamagePercent: 49,
  projectileCount: 1,
};

const class4Fresh: BallisticArmor = {
  id: "class4-fresh",
  name: "Class 4 (fresh)",
  armorClass: 4,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.5,
  zones: ["chest"],
};

const class3Fresh: BallisticArmor = {
  ...class4Fresh,
  id: "class3-fresh",
  name: "Class 3 (fresh)",
  armorClass: 3,
};

describe("simulateShot", () => {
  it("penetrates when penetration power overwhelms armor", () => {
    // M855 (pen 31) vs Class 3 fresh (effective 30). delta=1 → chance=1.
    const result = simulateShot(m855, class3Fresh, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(49);
    expect(result.armorDamage).toBeCloseTo(0.245, 3); // 49 * 0.5 / 100 = 0.245
    expect(result.remainingDurability).toBeCloseTo(80 - 0.245, 3);
    expect(result.residualPenetration).toBe(31);
  });

  it("does not penetrate when chance < 0.5", () => {
    // M855 (pen 31) vs Class 4 fresh (effective 40). delta=-9 → chance=1 - 9/15 ≈ 0.4
    const result = simulateShot(m855, class4Fresh, 15);
    expect(result.didPenetrate).toBe(false);
    expect(result.damage).toBeLessThan(49);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.armorDamage).toBeCloseTo(0.1225, 4); // half on deflection: 0.245/2
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
    expect(result.damage).toBe(49);
  });
});
