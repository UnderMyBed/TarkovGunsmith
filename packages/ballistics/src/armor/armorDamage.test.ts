import { describe, expect, it } from "vitest";
import { armorDamage, armorDamageBlocked, armorDamagePenetrated } from "./armorDamage.js";

// Live-sampled inputs (json.tarkov.dev, 2026-08-19):
//   5.56x45mm M995 — penetrationPower 53, armorDamage 52
//   6B13 assault armor (Flora) — class 4, durability 203, Aramid (destructibility 0.1875)
const M995_AD = 52;
const M995_PEN = 53;
const ARAMID = 0.1875;
const CLASS_4 = 4;

describe("armorDamageBlocked / armorDamagePenetrated", () => {
  it("matches the ground-truth blocked branch for a mid-range case", () => {
    // 53 × 0.52 × clamp(53/4*10, 0.6, 1.1)=1.1 × 0.1875 = 5.68425
    expect(armorDamageBlocked(M995_AD, ARAMID, M995_PEN, CLASS_4)).toBeCloseTo(5.68425, 5);
  });

  it("matches the ground-truth penetrated branch for a mid-range case", () => {
    // 53 × 0.52 × clamp(53/4*10, 0.5, 0.9)=0.9 × 0.1875 = 4.65075
    expect(armorDamagePenetrated(M995_AD, ARAMID, M995_PEN, CLASS_4)).toBeCloseTo(4.65075, 5);
  });

  it("damages armor MORE on a block than on a penetration, by the clamp-ceiling ratio", () => {
    // The shipped code halved damage on deflection. The original has the opposite
    // sign: the blocked ceiling is 1.1 against the penetrated 0.9 → 1.2222×.
    // See docs/operations/data-api-audit.md §G.
    const blocked = armorDamageBlocked(M995_AD, ARAMID, M995_PEN, CLASS_4);
    const penetrated = armorDamagePenetrated(M995_AD, ARAMID, M995_PEN, CLASS_4);
    expect(blocked).toBeGreaterThan(penetrated);
    expect(blocked / penetrated).toBeCloseTo(1.1 / 0.9, 10);
  });

  it("applies the min-1 durability floor to weak rounds on both branches", () => {
    // Buckshot-class round: 2 × 0.20 × 1.1 × 0.1875 = 0.0825 → floored to 1.
    expect(armorDamageBlocked(20, ARAMID, 2, 6)).toBe(1);
    expect(armorDamagePenetrated(20, ARAMID, 2, 6)).toBe(1);
  });

  it("floors a zero-penetration round to 1 rather than 0", () => {
    // The shipped code returned 0 here. The original's Math.Max(result, 1) does not.
    expect(armorDamageBlocked(50, ARAMID, 0, CLASS_4)).toBe(1);
    expect(armorDamagePenetrated(50, ARAMID, 0, CLASS_4)).toBe(1);
  });

  it("floors a zero-destructibility material to 1 rather than 0", () => {
    expect(armorDamageBlocked(80, 0, M995_PEN, CLASS_4)).toBe(1);
  });

  it("saturates the clamp ceiling, making damage strictly proportional to penetration", () => {
    // Under C# precedence the ratio is (pen/class)*10, which is >= 1.67 for any
    // round with pen >= 1 against any class <= 6 — always above the 1.1 ceiling.
    // So the clamp contributes a constant, and doubling penetration must exactly
    // double the damage. If the precedence reading ever changes, this breaks.
    const steel = 0.525; // ArmoredSteel, the live maximum destructibility
    const low = armorDamageBlocked(100, steel, 20, 6);
    const high = armorDamageBlocked(100, steel, 40, 6);
    expect(low).toBeCloseTo(20 * 1.0 * 1.1 * steel, 10);
    expect(high / low).toBeCloseTo(2, 10);
  });

  it("keeps the lower clamp rails unreachable behind the min-1 floor", () => {
    // The 0.6/0.5 rails engage only when pen < 0.06 * class (<= 0.36), where the
    // product cannot exceed 0.113 and the floor always wins. Documented rather
    // than deleted, because the rails go live if the precedence reading changes.
    expect(armorDamageBlocked(100, 0.525, 0.3, 6)).toBe(1);
    expect(armorDamagePenetrated(100, 0.525, 0.3, 6)).toBe(1);
  });
});

describe("armorDamage (expected-value blend)", () => {
  it("equals the blocked branch when penetration is impossible", () => {
    expect(armorDamage(M995_AD, ARAMID, M995_PEN, CLASS_4, 0)).toBeCloseTo(5.68425, 5);
  });

  it("equals the penetrated branch when penetration is certain", () => {
    expect(armorDamage(M995_AD, ARAMID, M995_PEN, CLASS_4, 1)).toBeCloseTo(4.65075, 5);
  });

  it("blends the two branches linearly in the penetration probability", () => {
    // 0.25 × 4.65075 + 0.75 × 5.68425 = 5.425875
    expect(armorDamage(M995_AD, ARAMID, M995_PEN, CLASS_4, 0.25)).toBeCloseTo(5.425875, 5);
  });

  it("decreases monotonically as penetration becomes more likely", () => {
    const at = (p: number) => armorDamage(M995_AD, ARAMID, M995_PEN, CLASS_4, p);
    const samples = [0, 0.2, 0.4, 0.6, 0.8, 1].map(at);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
  });
});
