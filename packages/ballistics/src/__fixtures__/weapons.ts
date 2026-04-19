import type { BallisticWeapon, BallisticMod } from "../types.js";

// SOURCE: https://escapefromtarkov.fandom.com/wiki/M4A1
export const M4A1: BallisticWeapon = {
  id: "fixture-m4a1",
  name: "Colt M4A1 5.56x45mm",
  baseErgonomics: 50,
  baseVerticalRecoil: 56,
  baseHorizontalRecoil: 220,
  baseWeight: 2.7,
  baseAccuracy: 3.5,
};

export const MK16_GRIP: BallisticMod = {
  id: "fixture-grip-mk16",
  name: "FN MK16 Pistol Grip",
  ergonomicsDelta: 8,
  recoilModifierPercent: -3,
  weight: 0.05,
  accuracyDelta: 0,
};

export const BUFFER_STOCK: BallisticMod = {
  id: "fixture-stock-buffer",
  name: "Mil-Spec Buffer Tube Stock",
  ergonomicsDelta: -2,
  recoilModifierPercent: -8,
  weight: 0.3,
  accuracyDelta: 0,
};

export const COMPENSATOR: BallisticMod = {
  id: "fixture-muzzle-comp",
  name: "AR-15 Compensator",
  ergonomicsDelta: -3,
  recoilModifierPercent: -15,
  weight: 0.1,
  accuracyDelta: -0.5,
};
