import { describe, expect, it } from "vitest";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";
import { rankArmorsForAmmo } from "./rankArmorsForAmmo.js";

const strongAmmo: BallisticAmmo = {
  id: "strong",
  name: "M995",
  penetrationPower: 53,
  damage: 49,
  armorDamagePercent: 64,
  projectileCount: 1,
};

const armors: BallisticArmor[] = [
  {
    id: "c3",
    name: "PACA",
    armorClass: 3,
    maxDurability: 40,
    currentDurability: 40,
    materialDestructibility: 0.55,
    zones: ["thorax"],
  },
  {
    id: "c4",
    name: "Kord",
    armorClass: 4,
    maxDurability: 60,
    currentDurability: 60,
    materialDestructibility: 0.5,
    zones: ["thorax"],
  },
  {
    id: "c6",
    name: "Slick",
    armorClass: 6,
    maxDurability: 80,
    currentDurability: 80,
    materialDestructibility: 0.5,
    zones: ["thorax"],
  },
];

describe("rankArmorsForAmmo", () => {
  it("returns one row per armor", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    expect(rows).toHaveLength(3);
  });

  it("lower-class armor breaks faster than higher-class armor", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    const shotsByArmor = Object.fromEntries(rows.map((r) => [r.armor.id, r.shotsToBreak]));
    // PACA (c3) breaks faster than Slick (c6) with M995.
    expect(shotsByArmor.c3).toBeLessThanOrEqual(shotsByArmor.c6);
  });

  it("classification respects shot cap", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    for (const r of rows) {
      if (Number.isFinite(r.shotsToBreak) && r.shotsToBreak <= 30) {
        expect(r.classification).toBe("reliable");
      }
    }
  });

  it("preserves input armor order", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    expect(rows.map((r) => r.armor.id)).toEqual(["c3", "c4", "c6"]);
  });

  it("empty armors returns []", () => {
    expect(rankArmorsForAmmo(strongAmmo, [], 30, 15)).toEqual([]);
  });
});
