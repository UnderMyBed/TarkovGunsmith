import { describe, expect, it } from "vitest";
import { armorDamage } from "./armorDamage.js";

describe("armorDamage", () => {
  it("computes damage on penetration as armorDamagePercent * destructibility / 100", () => {
    // armorDamagePercent=40, destructibility=0.5 → 40 * 0.5 / 100 = 0.20
    expect(armorDamage(40, 0.5, true)).toBeCloseTo(0.2, 5);
  });

  it("halves damage when the round did not penetrate", () => {
    // 40 * 0.5 / 100 = 0.20, halved on deflection → 0.10
    expect(armorDamage(40, 0.5, false)).toBeCloseTo(0.1, 5);
  });

  it("returns 0 for zero armorDamagePercent", () => {
    expect(armorDamage(0, 1.0, true)).toBe(0);
  });

  it("returns 0 for zero destructibility (indestructible material)", () => {
    expect(armorDamage(80, 0, true)).toBe(0);
  });

  it("scales with high-armorDamage ammunition", () => {
    // 80 * 0.85 / 100 = 0.68
    expect(armorDamage(80, 0.85, true)).toBeCloseTo(0.68, 5);
  });
});
