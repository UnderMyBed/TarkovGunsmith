import type { BallisticAmmo } from "../types.js";

/**
 * Ammunition fixtures sampled from the live `json.tarkov.dev` items document on
 * 2026-08-19. `id` is the real upstream item id so any value here can be
 * re-checked directly against upstream.
 *
 * These replace hand-invented values. The previous set carried magnitudes that
 * cannot occur upstream (M995 at armorDamage 64 / damage 49 against a real
 * 52 / 42), which is the class of fixture that let a 100× unit error pass a
 * green suite — see docs/operations/data-api-audit.md §B and §G.
 */

export const PS_545: BallisticAmmo = {
  id: "56dff3afd2720bba668b4567",
  name: "5.45x39mm PS gs",
  penetrationPower: 28,
  damage: 56,
  armorDamagePercent: 40,
  projectileCount: 1,
};

export const BT_545: BallisticAmmo = {
  id: "56dff061d2720bb5668b4567",
  name: "5.45x39mm BT gs",
  penetrationPower: 37,
  damage: 54,
  armorDamagePercent: 44,
  projectileCount: 1,
};

export const BP_545: BallisticAmmo = {
  id: "56dfef82d2720bbd668b4567",
  name: "5.45x39mm BP gs",
  penetrationPower: 45,
  damage: 48,
  armorDamagePercent: 46,
  projectileCount: 1,
};

export const M855: BallisticAmmo = {
  id: "54527a984bdc2d4e668b4567",
  name: "5.56x45mm M855",
  penetrationPower: 31,
  damage: 54,
  armorDamagePercent: 37,
  projectileCount: 1,
};

export const M995: BallisticAmmo = {
  id: "59e690b686f7746c9f75e848",
  name: "5.56x45mm M995",
  penetrationPower: 53,
  damage: 42,
  armorDamagePercent: 52,
  projectileCount: 1,
};
