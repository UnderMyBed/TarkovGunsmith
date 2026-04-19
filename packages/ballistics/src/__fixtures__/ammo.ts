import type { BallisticAmmo } from "../types.js";

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.45x39mm
export const PS_545: BallisticAmmo = {
  id: "fixture-545-ps",
  name: "5.45x39mm PS gs",
  penetrationPower: 21,
  damage: 50,
  armorDamagePercent: 38,
  projectileCount: 1,
};

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.45x39mm
export const BP_545: BallisticAmmo = {
  id: "fixture-545-bp",
  name: "5.45x39mm BP gs",
  penetrationPower: 40,
  damage: 50,
  armorDamagePercent: 50,
  projectileCount: 1,
};

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.56x45mm_NATO
export const M855: BallisticAmmo = {
  id: "fixture-556-m855",
  name: "5.56x45mm M855",
  penetrationPower: 31,
  damage: 49,
  armorDamagePercent: 49,
  projectileCount: 1,
};

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.56x45mm_NATO
export const M995: BallisticAmmo = {
  id: "fixture-556-m995",
  name: "5.56x45mm M995",
  penetrationPower: 53,
  damage: 49,
  armorDamagePercent: 64,
  projectileCount: 1,
};
