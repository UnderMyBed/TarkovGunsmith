import { describe, expect, it } from "vitest";
import type { ArmorListItem } from "@tarkov/data";
import { buildScenarioTarget } from "./buildScenarioTarget.js";
import { PMC_BODY_DEFAULTS } from "@tarkov/ballistics";

const paca: ArmorListItem = {
  id: "paca",
  name: "PACA",
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

const altyn: ArmorListItem = {
  id: "altyn",
  name: "Altyn",
  shortName: "Altyn",
  iconLink: "",
  properties: {
    __typename: "ItemPropertiesArmor",
    class: 4,
    durability: 50,
    material: { name: "Aramid", destructibility: 0.4 },
    zones: ["Head"],
  },
};

describe("buildScenarioTarget", () => {
  it("produces a fresh PMC target when no armor is provided", () => {
    const t = buildScenarioTarget({ helmet: undefined, bodyArmor: undefined });
    expect(t.parts.head.hp).toBe(PMC_BODY_DEFAULTS.head);
    expect(t.parts.thorax.hp).toBe(PMC_BODY_DEFAULTS.thorax);
    expect(t.helmet).toBeUndefined();
    expect(t.bodyArmor).toBeUndefined();
  });

  it("attaches adapted body armor when provided", () => {
    const t = buildScenarioTarget({ helmet: undefined, bodyArmor: paca });
    expect(t.bodyArmor).toBeDefined();
    expect(t.bodyArmor!.armorClass).toBe(3);
    expect(t.bodyArmor!.zones).toEqual(["thorax", "stomach"]);
  });

  it("attaches adapted helmet when provided", () => {
    const t = buildScenarioTarget({ helmet: altyn, bodyArmor: undefined });
    expect(t.helmet).toBeDefined();
    expect(t.helmet!.armorClass).toBe(4);
    expect(t.helmet!.zones).toEqual(["head"]);
  });

  it("handles both pieces together", () => {
    const t = buildScenarioTarget({ helmet: altyn, bodyArmor: paca });
    expect(t.helmet).toBeDefined();
    expect(t.bodyArmor).toBeDefined();
  });
});
