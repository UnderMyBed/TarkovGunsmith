import { describe, expect, it } from "vitest";
import { simulateBurst } from "./simulateBurst.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const m995: BallisticAmmo = {
  id: "m995",
  name: "M995",
  penetrationPower: 53,
  damage: 49,
  armorDamagePercent: 64,
  projectileCount: 1,
};

const class4Fresh: BallisticArmor = {
  id: "class4",
  name: "Class 4",
  armorClass: 4,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.5,
  zones: ["chest"],
};

describe("simulateBurst", () => {
  it("returns one result per shot", () => {
    const results = simulateBurst(m995, class4Fresh, 5, 15);
    expect(results).toHaveLength(5);
  });

  it("decreases remainingDurability monotonically across the burst", () => {
    const results = simulateBurst(m995, class4Fresh, 5, 15);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].remainingDurability).toBeLessThanOrEqual(
        results[i - 1].remainingDurability,
      );
    }
  });

  it("each shot's input armor reflects the previous shot's remainingDurability", () => {
    const results = simulateBurst(m995, class4Fresh, 3, 15);
    // M995 reliably penetrates Class 4 fresh, so subsequent shots see degraded armor.
    expect(results[0].didPenetrate).toBe(true);
    expect(results[1].remainingDurability).toBeLessThan(results[0].remainingDurability);
    expect(results[2].remainingDurability).toBeLessThan(results[1].remainingDurability);
  });

  it("returns empty array for zero shots", () => {
    expect(simulateBurst(m995, class4Fresh, 0, 15)).toEqual([]);
  });

  it("rejects negative shot counts (returns empty array)", () => {
    expect(simulateBurst(m995, class4Fresh, -3, 15)).toEqual([]);
  });

  it("does not mutate the caller's armor object", () => {
    const armor = { ...class4Fresh };
    const before = armor.currentDurability;
    simulateBurst(m995, armor, 5, 15);
    expect(armor.currentDurability).toBe(before);
  });
});
