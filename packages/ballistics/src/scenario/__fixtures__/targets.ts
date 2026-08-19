import type { BallisticArmor } from "../../types.js";

// Shaped after the Altyn bulletproof helmet: class 4, Aramid.
// `materialDestructibility` is the live `armorMaterials.Aramid.destructibility`
// (json.tarkov.dev, 2026-08-19), not an approximation — the previous 0.4 was
// not the value of any material in the table. See docs/operations/data-api-audit.md §G.
export const TEST_HELMET: BallisticArmor = {
  id: "fixture-test-helmet",
  name: "Test Helmet (Class 4)",
  armorClass: 4,
  maxDurability: 50,
  currentDurability: 50,
  materialDestructibility: 0.1875,
  zones: ["head"],
};

// Class-4 body armor protecting thorax + stomach with canonical Zone names.
// Shaped after 6B13 assault armor: class 4, Aramid, 203 durability.
export const TEST_BODY_ARMOR: BallisticArmor = {
  id: "fixture-test-body-c4",
  name: "Test Body Armor (Class 4)",
  armorClass: 4,
  maxDurability: 203,
  currentDurability: 203,
  materialDestructibility: 0.1875,
  zones: ["thorax", "stomach"],
};
