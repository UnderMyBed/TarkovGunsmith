import type { BallisticArmor } from "../types.js";

// SOURCE: https://escapefromtarkov.fandom.com/wiki/Armor_vests
export const PACA_C3: BallisticArmor = {
  id: "fixture-paca",
  name: "PACA Soft Armor (Class 3)",
  armorClass: 3,
  maxDurability: 40,
  currentDurability: 40,
  materialDestructibility: 0.55,
  zones: ["chest", "stomach"],
};

export const KORD_C4: BallisticArmor = {
  id: "fixture-kord",
  name: "Kord Defender-2 (Class 4)",
  armorClass: 4,
  maxDurability: 60,
  currentDurability: 60,
  materialDestructibility: 0.5,
  zones: ["chest", "stomach"],
};

export const HEXGRID_C5: BallisticArmor = {
  id: "fixture-hexgrid",
  name: "5.11 Hexgrid (Class 5)",
  armorClass: 5,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.45,
  zones: ["chest", "stomach"],
};

export const SLICK_C6: BallisticArmor = {
  id: "fixture-slick",
  name: "Slick (Class 6)",
  armorClass: 6,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.5,
  zones: ["chest", "stomach"],
};
