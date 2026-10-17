import type { BallisticMod } from "@tarkov/ballistics";
import type { BuildV6 } from "@tarkov/data";
import type { HydrateWeapon } from "../hydrate.js";

/**
 * Hand-constructed BuildV6 + the weapon and placed parts `hydrateBuildCard` takes. Every id, slot path and
 * numeric value below is taken from the live json.tarkov.dev items document
 * (sampled 2026-08-19; the accuracy, velocity and range fields 2026-10-17; the
 * weapon's own 0.75 kg 2026-10-17).
 *
 * The previous version claimed "real Tarkov item IDs" but the four it used
 * were a front sight, a receiver extension, an M-LOK rail, and one id absent
 * from upstream entirely — attached to `mod_barrel` / `mod_handguard` slots the
 * M4A1 does not have at top level. Its stat values were percent-scale too
 * (`recoilModifier: -22`, `accuracyModifier: 0.5` against a real max of 0.06),
 * which is the class of fixture that hid the unit error in
 * docs/operations/data-api-audit.md §B.
 */
export const m4a1Build: BuildV6 = {
  version: 6,
  weaponId: "5447a9cd4bdc2dbd208b4567", // Colt M4A1 5.56x45 assault rifle
  attachments: {
    mod_pistol_grip: "5a33e75ac4a2826c6e06d759",
    mod_stock: "5947e98b86f774778f1448bc",
    mod_reciever: "59bfe68886f7746004266202",
  },
  orphaned: [],
  createdAt: "2026-04-21T00:00:00.000Z",
  name: "RECOIL KING",
  description: "",
};

export const m4a1Weapon: HydrateWeapon = {
  shortName: "M4A1",
  ballistic: {
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
  },
};

/** None of these three is a barrel or a sight, and none changes muzzle velocity. */
const PLAIN = { centerOfImpact: 0, deviationMax: null, velocity: 0, sightingRange: null };

// recoilModifier / accuracyModifier are fractions, exactly as upstream returns
// them. Attached sum is -0.495, i.e. a real -49.5% recoil build. One entry per
// filled slot, in the order of `m4a1Build.attachments`.
export const m4a1Mods: BallisticMod[] = [
  {
    id: "5a33e75ac4a2826c6e06d759",
    name: "AR-15 Hera Arms CQR pistol grip/buttstock",
    weight: 0.499,
    ergonomicsDelta: 15,
    recoilModifier: -0.23,
    accuracyModifier: 0,
    ...PLAIN,
  },
  {
    id: "5947e98b86f774778f1448bc",
    name: "AR-15 Magpul UBR GEN2 stock (Black)",
    weight: 0.61,
    ergonomicsDelta: 8,
    recoilModifier: -0.225,
    accuracyModifier: 0,
    ...PLAIN,
  },
  {
    id: "59bfe68886f7746004266202",
    name: "AR-15 Vltor MUR-1S 5.56x45 upper receiver",
    weight: 0.246,
    ergonomicsDelta: 7,
    recoilModifier: -0.04,
    accuracyModifier: 0,
    ...PLAIN,
  },
];
