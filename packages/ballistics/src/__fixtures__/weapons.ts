import type { BallisticWeapon, BallisticMod } from "../types.js";

// SOURCE: live json.tarkov.dev items document. Recoil, ergonomics, weight and accuracy were
// sampled 2026-08-19; centerOfImpact, deviationCurve/deviationMax, velocity, fireRate,
// effectiveDistance, sightingRange and the default ammo on 2026-10-17. Every value here is
// what upstream actually returns for the named item id, and `pnpm verify:upstream` re-checks
// them. The previous fixtures were invented at percent scale (recoilModifier -15, 43x larger
// than upstream's -0.35 floor), which is why the 100x unit error in
// docs/operations/data-api-audit.md §B went undetected for years.

// Colt M4A1 5.56x45 assault rifle. `properties.weight` is the bare receiver, which is what the
// Builder wants. Its default ammo is 5.56x45mm M855 (54527a984bdc2d4e668b4567), 922 m/s.
export const M4A1: BallisticWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45",
  baseErgonomics: 48,
  baseVerticalRecoil: 119,
  baseHorizontalRecoil: 342,
  baseWeight: 0.75,
  centerOfImpact: 0.01,
  deviationCurve: 1.35,
  velocity: 0,
  fireRate: 800,
  effectiveDistance: 500,
  sightingRange: 100,
  defaultAmmo: { name: "M855", initialSpeed: 922 },
};

/** What every mod that is neither a barrel nor a sight carries for these fields. */
const PLAIN = { centerOfImpact: 0, deviationMax: null, velocity: 0, sightingRange: null } as const;

export const CQR_GRIP: BallisticMod = {
  id: "5a33e75ac4a2826c6e06d759",
  name: "AR-15 Hera Arms CQR pistol grip/buttstock",
  ergonomicsDelta: 15,
  recoilModifier: -0.23,
  weight: 0.499,
  accuracyModifier: 0,
  ...PLAIN,
};

export const UBR_GEN2_STOCK: BallisticMod = {
  id: "5947e98b86f774778f1448bc",
  name: "AR-15 Magpul UBR GEN2 stock (Black)",
  ergonomicsDelta: 8,
  recoilModifier: -0.225,
  weight: 0.61,
  accuracyModifier: 0,
  ...PLAIN,
};

// Carries a real positive accuracyModifier, so it exercises the MOA sign flip.
export const VP09_MUZZLE_BRAKE: BallisticMod = {
  id: "5a7c147ce899ef00150bd8b8",
  name: "AR-15 Vendetta Precision VP-09 Interceptor 5.56x45 muzzle brake",
  ergonomicsDelta: -2,
  recoilModifier: -0.085,
  weight: 0.2,
  accuracyModifier: 0.04,
  ...PLAIN,
};

// A barrel: the build's dispersion, and a velocity modifier in PERCENT (-11 = -11%).
export const AR15_BARREL_10_3: BallisticMod = {
  id: "55d35ee94bdc2d61338b4568",
  name: "AR-15 5.56x45 10.3 inch barrel",
  ergonomicsDelta: -2,
  recoilModifier: -0.052000000000000005,
  weight: 0.409,
  accuracyModifier: 0,
  centerOfImpact: 0.07,
  deviationMax: 22,
  velocity: -11,
  sightingRange: null,
};

// A sight whose sighting range (metres) outranges the weapon's own 100.
export const HAMR_SCOPE: BallisticMod = {
  id: "544a3a774bdc2d3a388b4567",
  name: "Leupold Mark 4 HAMR 4x24 DeltaPoint hybrid assault scope",
  ergonomicsDelta: -3.5,
  recoilModifier: 0,
  weight: 0.411,
  accuracyModifier: 0,
  centerOfImpact: 0,
  deviationMax: null,
  velocity: 0,
  sightingRange: 800,
};
