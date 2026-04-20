import { describe, expect, it } from "vitest";
import type { ShotResult } from "@tarkov/ballistics";
import { adcSummary } from "./adcSummary.js";

const shot = (dmg: number, pen: boolean, rem: number, armorDmg = 5): ShotResult => ({
  didPenetrate: pen,
  damage: dmg,
  armorDamage: armorDmg,
  remainingDurability: rem,
  residualPenetration: 30,
});

describe("adcSummary", () => {
  it("sums total flesh damage across all shots", () => {
    const out = adcSummary([shot(20, false, 35), shot(20, false, 30), shot(40, true, 25)], 40);
    expect(out.totalDamage).toBe(80);
  });

  it("reports firstPenetrationAt as the zero-based index of the first penetrating shot", () => {
    const out = adcSummary([shot(5, false, 35), shot(10, false, 30), shot(40, true, 25)], 40);
    expect(out.firstPenetrationAt).toBe(2);
  });

  it("returns firstPenetrationAt=null when no shot penetrates", () => {
    const out = adcSummary([shot(5, false, 35), shot(10, false, 30)], 40);
    expect(out.firstPenetrationAt).toBeNull();
  });

  it("final durability reflects the last shot's remainingDurability", () => {
    const out = adcSummary([shot(5, false, 35), shot(5, false, 20)], 40);
    expect(out.finalDurability).toBe(20);
  });

  it("empty results returns zeros and null firstPen", () => {
    const out = adcSummary([], 40);
    expect(out.totalDamage).toBe(0);
    expect(out.firstPenetrationAt).toBeNull();
    expect(out.finalDurability).toBe(40);
  });
});
