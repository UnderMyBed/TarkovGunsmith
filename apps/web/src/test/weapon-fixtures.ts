import type { BallisticMod, BallisticWeapon } from "@tarkov/ballistics";
import type { MountedMagazine } from "@tarkov/data";

// Live json.tarkov.dev values (2026-10-17) for the named ids.

/** Colt M4A1 5.56x45 assault rifle (5447a9cd4bdc2dbd208b4567). */
export const M4A1: BallisticWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45 assault rifle",
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

/** Hera Arms CQR + Magpul UBR GEN2 + Vltor MUR-1S: recoil modifiers summing to −49.5%. */
export const RECOIL_MODS: BallisticMod[] = [
  {
    id: "5a33e75ac4a2826c6e06d759",
    name: "CQR AR15",
    ergonomicsDelta: 15,
    recoilModifier: -0.23,
    weight: 0.499,
    accuracyModifier: 0,
    ...PLAIN,
  },
  {
    id: "5947e98b86f774778f1448bc",
    name: "UBR GEN2",
    ergonomicsDelta: 8,
    recoilModifier: -0.225,
    weight: 0.61,
    accuracyModifier: 0,
    ...PLAIN,
  },
  {
    id: "59bfe68886f7746004266202",
    name: "MUR-1S",
    ergonomicsDelta: 7,
    recoilModifier: -0.04,
    weight: 0.246,
    accuracyModifier: 0,
    ...PLAIN,
  },
];

/** AR-15 5.56x45 10.3 inch barrel (55d35ee94bdc2d61338b4568). */
export const BARREL_10_3: BallisticMod = {
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

/** AR-15 Vendetta Precision VP-09 Interceptor muzzle brake (5a7c147ce899ef00150bd8b8). */
export const VP09: BallisticMod = {
  id: "5a7c147ce899ef00150bd8b8",
  name: "VP-09",
  ergonomicsDelta: -2,
  recoilModifier: -0.085,
  weight: 0.2,
  accuracyModifier: 0.04,
  centerOfImpact: 0,
  deviationMax: null,
  velocity: 0,
  sightingRange: null,
};

/** Leupold Mark 4 HAMR 4x24 (544a3a774bdc2d3a388b4567). */
export const HAMR: BallisticMod = {
  id: "544a3a774bdc2d3a388b4567",
  name: "HAMR",
  ergonomicsDelta: -3.5,
  recoilModifier: 0,
  weight: 0.411,
  accuracyModifier: 0,
  centerOfImpact: 0,
  deviationMax: null,
  velocity: 0,
  sightingRange: 800,
};

/** AR-15 5.56x45 Colt STANAG 30-round magazine (55d4887d4bdc2d962f8b4570). */
export const STANAG: MountedMagazine = {
  id: "55d4887d4bdc2d962f8b4570",
  name: "AR-15 5.56x45 Colt STANAG 30-round magazine",
  capacity: 30,
  loadModifier: 0,
  malfunctionChance: 0.08,
};
