import { describe, expect, it } from "vitest";
import { penetrationChance } from "./penetrationChance.js";

describe("penetrationChance", () => {
  it("returns 1.0 when armor durability is zero (broken armor)", () => {
    // Broken armor offers no resistance, so even a peashooter penetrates.
    expect(penetrationChance(1, 6, 0, 80)).toBe(1.0);
  });

  it("returns 1.0 when penetration overwhelms effective resistance", () => {
    // M61-class round (penetration ~70) vs Class 4 fresh: 70 >= 4*10*1.0 = 40.
    expect(penetrationChance(70, 4, 80, 80)).toBe(1.0);
  });

  it("returns 0.0 when penetration is far below effective resistance", () => {
    // PS round (penetration ~20) vs Class 6 fresh: 20 - 6*10*1.0 = -40, well below -15.
    expect(penetrationChance(20, 6, 60, 60)).toBe(0.0);
  });

  it("ramps linearly between -15 and 0 delta", () => {
    // Half-durability Class 4: effectiveResistance = 4*10*(0.5 + 0.5*0.5) = 30.
    // Penetration 22.5 → delta = 22.5 - 30 = -7.5 → chance = 1 - 7.5/15 = 0.5.
    expect(penetrationChance(22.5, 4, 40, 80)).toBeCloseTo(0.5, 5);
  });

  it("clamps non-negative inputs sensibly (durabilityPercent capped at 1)", () => {
    // currentDurability > maxDurability shouldn't break the math.
    expect(penetrationChance(40, 4, 100, 80)).toBe(1.0);
  });
});
