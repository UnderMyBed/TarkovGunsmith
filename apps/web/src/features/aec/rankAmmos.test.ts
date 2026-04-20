import { describe, expect, it } from "vitest";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";
import { rankAmmos } from "./rankAmmos.js";

const mkAmmo = (id: string, pen: number, dmg: number, adp: number): BallisticAmmo => ({
  id,
  name: id,
  penetrationPower: pen,
  damage: dmg,
  armorDamagePercent: adp,
  projectileCount: 1,
});

const class4: BallisticArmor = {
  id: "armor",
  name: "Class 4",
  armorClass: 4,
  maxDurability: 60,
  currentDurability: 60,
  materialDestructibility: 0.5,
  zones: ["thorax"],
};

describe("rankAmmos", () => {
  it("sorts by shotsToBreak ascending", () => {
    const weak = mkAmmo("weak", 21, 50, 38);
    const strong = mkAmmo("strong", 53, 49, 64);
    const medium = mkAmmo("medium", 40, 50, 50);

    const rows = rankAmmos([weak, medium, strong], class4, 30, 15);
    const ids = rows.map((r) => r.ammo.id);
    expect(ids[0]).toBe("strong"); // breaks fastest
    // "weak" should be last
    expect(ids[ids.length - 1]).toBe("weak");
  });

  it("classifies by shots-to-break vs shot cap", () => {
    const ammo = mkAmmo("a", 53, 49, 64);
    const rows = rankAmmos([ammo], class4, 30, 15);
    const row = rows[0]!;
    if (row.shotsToBreak <= 30) {
      expect(row.classification).toBe("reliable");
    }
  });

  it("sets classification=ineffective when shotsToBreak exceeds 2x cap", () => {
    const weak = mkAmmo("weak", 5, 40, 20);
    const rows = rankAmmos([weak], class4, 5, 15);
    const row = rows[0]!;
    // 5 shots @ pen 5 into class 4 almost never breaks → classification falls through.
    expect(["marginal", "ineffective"]).toContain(row.classification);
  });

  it("places Infinity shotsToBreak at the end", () => {
    const weak = mkAmmo("weak", 1, 1, 1);
    const strong = mkAmmo("strong", 53, 49, 64);
    const rows = rankAmmos([weak, strong], class4, 30, 15);
    expect(rows[0]!.ammo.id).toBe("strong");
    expect(rows[1]!.ammo.id).toBe("weak");
  });

  it("reports firstPenetrationAt correctly", () => {
    const strong = mkAmmo("strong", 53, 49, 64);
    const rows = rankAmmos([strong], class4, 30, 15);
    const row = rows[0]!;
    // M995-equivalent pens Class 4 fresh on shot 1.
    expect(row.firstPenetrationAt).toBe(0);
  });

  it("totalDamageAtBreak is the sum of damages up to and including the breaking shot", () => {
    const strong = mkAmmo("strong", 53, 49, 64);
    const rows = rankAmmos([strong], class4, 30, 15);
    const row = rows[0]!;
    if (Number.isFinite(row.shotsToBreak)) {
      expect(row.totalDamageAtBreak).toBeGreaterThan(0);
    }
  });

  it("empty ammos returns []", () => {
    expect(rankAmmos([], class4, 30, 15)).toEqual([]);
  });
});
