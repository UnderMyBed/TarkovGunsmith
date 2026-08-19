import type { BallisticWeapon, BallisticMod } from "../types.js";

// SOURCE: live json.tarkov.dev items document, sampled 2026-08-19. Every value
// here is what upstream actually returns for the named item id. The previous
// fixtures were invented at percent scale (recoilModifier -15, 43x larger than
// upstream's -0.35 floor), which is why the 100x unit error in
// docs/operations/data-api-audit.md §B went undetected for years.

// Colt M4A1 5.56x45 assault rifle. `properties.weight` is the bare receiver,
// which is what the Builder wants. baseAccuracy has no upstream counterpart —
// 3.5 mirrors DEFAULT_BASE_ACCURACY in packages/tarkov-data/src/ballistic-adapters.ts.
export const M4A1: BallisticWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45",
  baseErgonomics: 48,
  baseVerticalRecoil: 119,
  baseHorizontalRecoil: 342,
  baseWeight: 0.75,
  baseAccuracy: 3.5,
};

export const CQR_GRIP: BallisticMod = {
  id: "5a33e75ac4a2826c6e06d759",
  name: "AR-15 Hera Arms CQR pistol grip/buttstock",
  ergonomicsDelta: 15,
  recoilModifier: -0.23,
  weight: 0.499,
  accuracyModifier: 0,
};

export const UBR_GEN2_STOCK: BallisticMod = {
  id: "5947e98b86f774778f1448bc",
  name: "AR-15 Magpul UBR GEN2 stock (Black)",
  ergonomicsDelta: 8,
  recoilModifier: -0.225,
  weight: 0.61,
  accuracyModifier: 0,
};

// Carries a real positive accuracyModifier, so it exercises the MOA sign flip.
export const VP09_MUZZLE_BRAKE: BallisticMod = {
  id: "5a7c147ce899ef00150bd8b8",
  name: "AR-15 Vendetta Precision VP-09 Interceptor 5.56x45 muzzle brake",
  ergonomicsDelta: -2,
  recoilModifier: -0.085,
  weight: 0.2,
  accuracyModifier: 0.04,
};
