import type { BuildV6 } from "@tarkov/data";
import { DEFAULT_BASE_ACCURACY } from "@tarkov/data";
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

/** GraphQL-shaped mod row the hydrator expects. */
export interface HydrateMod {
  id: string;
  shortName: string;
  weight: number;
  properties: {
    ergonomics?: number;
    recoilModifier?: number;
    accuracyModifier?: number;
  } | null;
}

export interface HydrateBuildArgs {
  build: BuildV6;
  weapon: HydrateWeapon;
  mods: readonly HydrateMod[];
  /**
   * What the build costs — the weapon or preset plus its parts — or `null` when that is not
   * known. The caller prices it with `@tarkov/data`'s `buildPriceUnder`, the Builder's own
   * rule; the card only prints it.
   */
  priceRub: number | null;
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
          // Accuracy is multiplicative, so a 0 base pinned the card's ACCURACY
          // cell to a meaningless 0.0 on every share image. Use the same
          // fabricated baseline the Builder shows, so the card mirrors it.
          baseAccuracy: DEFAULT_BASE_ACCURACY,
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
    priceRub: args.priceRub,
    stats,
  };
}

/** One side of a pair card. The pair card shows no price. */
export type HydrateSideArgs = Omit<HydrateBuildArgs, "priceRub">;

export interface HydratePairArgs {
  left: HydrateSideArgs | null;
  right: HydrateSideArgs | null;
}

/**
 * Pair-card hydrator — produces a `PairCardViewModel` with one or both sides
 * populated. Either side may be `null` for single-sided pair cards.
 *
 * @example
 * const vm = hydratePairCard({ left, right });
 */
export function hydratePairCard(args: HydratePairArgs): PairCardViewModel {
  const makeSide = (a: HydrateSideArgs): SideViewModel => {
    const vm = hydrateBuildCard({ ...a, priceRub: null });
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
