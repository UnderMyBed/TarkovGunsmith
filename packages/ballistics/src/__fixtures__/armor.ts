import type { BallisticArmor } from "../types.js";

/**
 * Armor fixtures sampled from the live `json.tarkov.dev` items document on
 * 2026-08-19. `id` is the real upstream item id; `materialDestructibility` is
 * the `armorMaterials[material].destructibility` value that item resolves to.
 *
 * These replace hand-invented values. The previous set had a "PACA (Class 3)"
 * at durability 40 / destructibility 0.55, where live PACA is class 2 /
 * durability 100 / Aramid 0.1875 — and 0.55 is not the destructibility of any
 * material in either table. Two of the four named items no longer exist as
 * vests upstream at all. See docs/operations/data-api-audit.md §G.
 *
 * The set spans armor classes 2–6 and four of the five live materials so the
 * clamp and floor behaviour is exercised across the real input range.
 *
 * NOTE: every live vest also carries `armorSlots` with per-slot class,
 * durability and material — top-level `class`/`durability` is a rollup over
 * plates plus soft panels. Modelling that is deliberately out of scope here;
 * see docs/adr/ for the plate-era decision.
 */

export const PACA_C2: BallisticArmor = {
  id: "5648a7494bdc2d9d488b4583",
  name: "PACA Soft Armor",
  armorClass: 2,
  maxDurability: 100,
  currentDurability: 100,
  materialDestructibility: 0.1875, // Aramid
  zones: ["chest", "stomach"],
};

export const MF_UNTAR_C3: BallisticArmor = {
  id: "5ab8e4ed86f7742d8e50c7fa",
  name: "MF-UNTAR body armor",
  armorClass: 3,
  maxDurability: 100,
  currentDurability: 100,
  materialDestructibility: 0.45, // Aluminium
  zones: ["chest", "stomach"],
};

export const SIX_B13_C4: BallisticArmor = {
  id: "5c0e51be86f774598e797894",
  name: "6B13 assault armor (Flora)",
  armorClass: 4,
  maxDurability: 203,
  currentDurability: 203,
  materialDestructibility: 0.1875, // Aramid
  zones: ["chest", "stomach"],
};

export const FORT_DEFENDER_C5: BallisticArmor = {
  id: "5e9dacf986f774054d6b89f4",
  name: "FORT Defender-2 body armor",
  armorClass: 5,
  maxDurability: 320,
  currentDurability: 320,
  materialDestructibility: 0.525, // ArmoredSteel
  zones: ["chest", "stomach"],
};

export const HEXGRID_C6: BallisticArmor = {
  id: "5fd4c474dd870108a754b241",
  name: "5.11 Tactical Hexgrid plate carrier",
  armorClass: 6,
  maxDurability: 100,
  currentDurability: 100,
  materialDestructibility: 0.3375, // UHMWPE
  zones: ["chest", "stomach"],
};

export const ZABRALO_C6: BallisticArmor = {
  id: "545cdb794bdc2d3a198b456a",
  name: "6B43 Zabralo-Sh body armor (EMR)",
  armorClass: 6,
  maxDurability: 510,
  currentDurability: 510,
  materialDestructibility: 0.1875, // Aramid
  zones: ["chest", "stomach"],
};
