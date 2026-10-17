import { weaponSpec, type BallisticMod, type BallisticWeapon } from "@tarkov/ballistics";
import type { BuildCardViewModel, PairCardViewModel, SideViewModel } from "./view-model.js";

/** The weapon a card is drawn for. */
export interface HydrateWeapon {
  /** The headline name, e.g. "M4A1". */
  shortName: string;
  /**
   * The weapon's own stats, from `@tarkov/data`'s `adaptWeapon` — the input the Builder hands
   * `weaponSpec` (`useBuilderState`), its own weight included.
   */
  ballistic: BallisticWeapon;
}

export interface HydrateBuildArgs {
  /** The build's own name; the weapon's short name heads the card when it has none. */
  name: string | undefined;
  weapon: HydrateWeapon;
  /**
   * Every part on the weapon, one per filled slot (a part fitted twice is two entries), from
   * `@tarkov/data`'s `adaptMod` over `resolveBuild(...).placed` — the Builder's own input.
   */
  mods: readonly BallisticMod[];
  /**
   * What the build costs — the weapon or preset plus its parts — or `null` when that is not
   * known. The caller prices it with `@tarkov/data`'s `buildPriceUnder`, the Builder's own
   * rule; the card only prints it.
   */
  priceRub: number | null;
  /**
   * The availability pill, or `null` for none. The caller works it out under the build's gate
   * the way the Builder does; the card only prints it.
   */
  availability: string | null;
}

/**
 * Pure hydrator: a build's weapon and placed parts into a `BuildCardViewModel`. The stats are
 * `weaponSpec` over exactly the inputs the Builder passes it, so the card and the page cannot
 * disagree on ergonomics, recoil, weight or MOA.
 *
 * @example
 * const vm = hydrateBuildCard({ name, weapon, mods, priceRub, availability });
 * // vm.title, vm.stats.weight
 */
export function hydrateBuildCard(args: HydrateBuildArgs): BuildCardViewModel {
  const { name, weapon, mods } = args;
  const hasName = name !== undefined && name.length > 0;
  const spec = weaponSpec(weapon.ballistic, mods);
  return {
    title: hasName ? name : weapon.shortName,
    subtitle: hasName ? weapon.shortName : null,
    modCount: mods.length,
    availability: args.availability,
    priceRub: args.priceRub,
    stats: {
      ergo: spec.ergonomics,
      recoilV: spec.verticalRecoil,
      recoilH: spec.horizontalRecoil,
      weight: spec.weight,
      accuracy: spec.accuracy,
    },
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
