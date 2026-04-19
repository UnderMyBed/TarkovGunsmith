import { describe, expect, it } from "vitest";
import { effectiveDamage } from "./effectiveDamage.js";

describe("effectiveDamage", () => {
  it("returns full ammo damage on penetration", () => {
    expect(effectiveDamage(60, 4, 80, 80, true)).toBe(60);
  });

  it("mitigates damage on deflection by class * 0.1 at full durability", () => {
    // 60 * (1 - 4 * 0.1 * 1.0) = 60 * 0.6 = 36
    expect(effectiveDamage(60, 4, 80, 80, false)).toBeCloseTo(36, 5);
  });

  it("mitigates less when armor is half-durability", () => {
    // 60 * (1 - 4 * 0.1 * 0.5) = 60 * 0.8 = 48
    expect(effectiveDamage(60, 4, 40, 80, false)).toBeCloseTo(48, 5);
  });

  it("does not negate damage even against class 6 fresh (clamped to 0 minimum)", () => {
    // 60 * (1 - 6 * 0.1 * 1.0) = 60 * 0.4 = 24 — still positive
    expect(effectiveDamage(60, 6, 80, 80, false)).toBeCloseTo(24, 5);
  });

  it("clamps to 0 if mitigation would go negative (hypothetical class 11 case)", () => {
    // Class 11 doesn't exist in EFT but the math must remain non-negative.
    expect(effectiveDamage(50, 11, 80, 80, false)).toBe(0);
  });

  it("ignores armor entirely on penetration even against high class", () => {
    expect(effectiveDamage(60, 6, 80, 80, true)).toBe(60);
  });
});
