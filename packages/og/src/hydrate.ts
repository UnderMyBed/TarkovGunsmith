import type { BuildV4 } from "@tarkov/data";
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
}

export interface HydrateBuildArgs {
  build: BuildV4;
  weapon: HydrateWeapon;
  mods: readonly HydrateMod[];
}

/**
 * Pure hydrator — turns a `BuildV4` + already-fetched weapon/mods rows into a
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
          baseWeight: 0,
          baseAccuracy: 0,
        },
        attachedMods.map((m) => ({
          id: m.id,
          name: m.shortName,
          ergonomicsDelta: m.properties?.ergonomics ?? 0,
          recoilModifierPercent: m.properties?.recoilModifier ?? 0,
          accuracyDelta: m.properties?.accuracyModifier ?? 0,
          weight: m.weight,
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
