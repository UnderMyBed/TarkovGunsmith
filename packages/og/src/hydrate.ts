import type { BuildV6 } from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import type { BuildCardViewModel, PairCardViewModel, SideViewModel } from "./view-model.js";

/**
 * GraphQL-shaped weapon row the hydrator expects. Matches the relevant subset
 * of `api.tarkov.dev` `Item`/`ItemPropertiesWeapon` fields; the Pages Function
 * in Phase 2 is responsible for shaping the fetched data into this form.
 */
export interface HydrateWeapon {
  id: string;
  shortName: string;
  properties: {
    ergonomics: number;
    recoilVertical: number;
    recoilHorizontal: number;
    /** Centimetres at 100 m; with the barrel's, the card's MOA. */
    centerOfImpact: number;
    deviationCurve: number;
    /** Percent. */
    velocity: number;
    fireRate: number;
    effectiveDistance: number;
    sightingRange: number;
    defaultAmmo: { name: string; initialSpeed: number } | null;
  } | null;
}

/**
 * GraphQL-shaped mod row the hydrator expects. `buyFor` is the trader/flea
 * offer list; the minimum `priceRUB` across offers is used for `priceRub`.
 */
export interface HydrateMod {
  id: string;
  shortName: string;
  weight: number;
  buyFor: { priceRUB: number }[];
  properties: {
    ergonomics?: number;
    recoilModifier?: number;
    accuracyModifier?: number;
  } | null;
  /** A barrel's `centerOfImpact` in cm at 100 m; 0 for other parts (see `adaptMod`). */
  centerOfImpact: number;
  /** A barrel's `deviationMax`; `null` for other parts. */
  deviationMax: number | null;
  /** Muzzle velocity modifier, a percent. */
  velocity: number;
  /** A sight's sighting range in metres; `null` for other parts. */
  sightingRange: number | null;
}

export interface HydrateBuildArgs {
  build: BuildV6;
  weapon: HydrateWeapon;
  mods: readonly HydrateMod[];
}

/**
 * Pure hydrator — turns a `BuildV6` + already-fetched weapon/mods rows into a
 * `BuildCardViewModel`. No network, no `@tarkov/data` hooks. The Pages
 * Function (Phase 2) handles the GraphQL fetch and calls this.
 *
 * @example
 * const vm = hydrateBuildCard({ build, weapon, mods });
 * // vm.title, vm.stats.ergo, vm.priceRub
 */
export function hydrateBuildCard(args: HydrateBuildArgs): BuildCardViewModel {
  const { build, weapon, mods } = args;
  const attachedIds = Object.values(build.attachments);
  const attachedMods = attachedIds
    .map((id) => mods.find((m) => m.id === id))
    .filter((m): m is HydrateMod => m !== undefined);

  const modCount = attachedMods.length;

  const hasName = build.name !== undefined && build.name.length > 0;
  const title = hasName ? (build.name as string) : weapon.shortName;
  const subtitle = hasName ? weapon.shortName : null;

  const priceRub = attachedMods.every((m) => m.buyFor.length > 0)
    ? attachedMods.reduce((sum, m) => sum + Math.min(...m.buyFor.map((b) => b.priceRUB)), 0)
    : null;

  const spec = weapon.properties
    ? weaponSpec(
        {
          id: weapon.id,
          name: weapon.shortName,
          baseErgonomics: weapon.properties.ergonomics,
          baseVerticalRecoil: weapon.properties.recoilVertical,
          baseHorizontalRecoil: weapon.properties.recoilHorizontal,
          // `weight` is summed separately below, so the base is intentionally 0.
          baseWeight: 0,
          centerOfImpact: weapon.properties.centerOfImpact,
          deviationCurve: weapon.properties.deviationCurve,
          velocity: weapon.properties.velocity,
          fireRate: weapon.properties.fireRate,
          effectiveDistance: weapon.properties.effectiveDistance,
          sightingRange: weapon.properties.sightingRange,
          defaultAmmo: weapon.properties.defaultAmmo,
        },
        // Passthrough, no unit conversion: `recoilModifier` and
        // `accuracyModifier` are fractions on both sides. Stays inline rather
        // than using @tarkov/data's `adaptMod` because `HydrateMod` is a
        // deliberately looser Pages-Function shape, not an `AttachablePart` —
        // optional properties, `shortName`, and a `buyFor` price list.
        attachedMods.map((m) => ({
          id: m.id,
          name: m.shortName,
          ergonomicsDelta: m.properties?.ergonomics ?? 0,
          recoilModifier: m.properties?.recoilModifier ?? 0,
          accuracyModifier: m.properties?.accuracyModifier ?? 0,
          weight: m.weight,
          centerOfImpact: m.centerOfImpact,
          deviationMax: m.deviationMax,
          velocity: m.velocity,
          sightingRange: m.sightingRange,
        })),
      )
    : null;

  const stats = {
    ergo: spec?.ergonomics ?? null,
    recoilV: spec?.verticalRecoil ?? null,
    recoilH: spec?.horizontalRecoil ?? null,
    weight: attachedMods.reduce((s, m) => s + m.weight, 0),
    accuracy: spec?.accuracy ?? null,
  };

  return {
    title,
    subtitle,
    modCount,
    availability: "FLEA",
    priceRub,
    stats,
  };
}

export interface HydratePairArgs {
  left: HydrateBuildArgs | null;
  right: HydrateBuildArgs | null;
}

/**
 * Pair-card hydrator — produces a `PairCardViewModel` with one or both sides
 * populated. Either side may be `null` for single-sided pair cards.
 *
 * @example
 * const vm = hydratePairCard({ left, right });
 */
export function hydratePairCard(args: HydratePairArgs): PairCardViewModel {
  const makeSide = (a: HydrateBuildArgs): SideViewModel => {
    const vm = hydrateBuildCard(a);
    return {
      weapon: a.weapon.shortName,
      modCount: vm.modCount,
      availability: vm.availability,
      stats: {
        ergo: vm.stats.ergo,
        recoilV: vm.stats.recoilV,
        recoilH: vm.stats.recoilH,
        weight: vm.stats.weight,
      },
    };
  };
  return {
    left: args.left ? makeSide(args.left) : null,
    right: args.right ? makeSide(args.right) : null,
  };
}
