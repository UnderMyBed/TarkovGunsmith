import type { BallisticArmor } from "../../types.js";

// Source: ALTYN helmet approximation (class 4, 50 max durability, aramid ~0.4).
// SOURCE: https://escapefromtarkov.fandom.com/wiki/Altyn_bulletproof_helmet
export const TEST_HELMET: BallisticArmor = {
  id: "fixture-test-helmet",
  name: "Test Helmet (Class 4)",
  armorClass: 4,
  maxDurability: 50,
  currentDurability: 50,
  materialDestructibility: 0.4,
  zones: ["head"],
};

// Class-4 body armor protecting thorax + stomach with canonical Zone names.
// Paired with KORD_C4 values from the existing ammo fixture suite.
export const TEST_BODY_ARMOR: BallisticArmor = {
  id: "fixture-test-body-c4",
  name: "Test Body Armor (Class 4)",
  armorClass: 4,
  maxDurability: 60,
  currentDurability: 60,
  materialDestructibility: 0.5,
  zones: ["thorax", "stomach"],
};

// A class-3 body armor for lighter-penetration tests.
export const TEST_BODY_ARMOR_C3: BallisticArmor = {
  id: "fixture-test-body-c3",
  name: "Test Body Armor (Class 3)",
  armorClass: 3,
  maxDurability: 40,
  currentDurability: 40,
  materialDestructibility: 0.55,
  zones: ["thorax", "stomach"],
};
