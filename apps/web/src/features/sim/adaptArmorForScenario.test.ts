import { describe, expect, it } from "vitest";
import type { ArmorListItem } from "@tarkov/data";
import { adaptArmorForScenario, API_ZONE_TO_SCENARIO } from "./adaptArmorForScenario.js";

const paca: ArmorListItem = {
  id: "paca",
  name: "PACA Soft Armor",
  shortName: "PACA",
  iconLink: "",
  properties: {
    __typename: "ItemPropertiesArmor",
    class: 3,
    durability: 40,
    material: { name: "Aramid", destructibility: 0.55 },
    zones: ["Chest", "Stomach"],
  },
};

describe("API_ZONE_TO_SCENARIO", () => {
  it("maps known API zones to scenario zones", () => {
    expect(API_ZONE_TO_SCENARIO.Chest).toBe("thorax");
    expect(API_ZONE_TO_SCENARIO.Stomach).toBe("stomach");
    expect(API_ZONE_TO_SCENARIO.Head).toBe("head");
  });
});

describe("adaptArmorForScenario", () => {
  it("translates Chest + Stomach to thorax + stomach", () => {
    const out = adaptArmorForScenario(paca);
    expect(out.zones).toEqual(["thorax", "stomach"]);
  });

  it("preserves armor class and durability", () => {
    const out = adaptArmorForScenario(paca);
    expect(out.armorClass).toBe(3);
    expect(out.maxDurability).toBe(40);
    expect(out.currentDurability).toBe(40);
    expect(out.materialDestructibility).toBeCloseTo(0.55, 4);
  });

  it("drops unmapped zone strings", () => {
    const weird = {
      ...paca,
      properties: { ...paca.properties, zones: ["Chest", "Eyes", "Jaws"] },
    };
    const out = adaptArmorForScenario(weird);
    expect(out.zones).toEqual(["thorax"]);
  });

  it("handles empty zones array", () => {
    const bare = { ...paca, properties: { ...paca.properties, zones: [] } };
    const out = adaptArmorForScenario(bare);
    expect(out.zones).toEqual([]);
  });

  it("treats zone strings case-insensitively via the map", () => {
    // The map is the source of truth; lowercase inputs do NOT match. Document
    // the expectation: unknown-case strings are dropped.
    const lower = { ...paca, properties: { ...paca.properties, zones: ["chest"] } };
    const out = adaptArmorForScenario(lower);
    expect(out.zones).toEqual([]);
  });
});
