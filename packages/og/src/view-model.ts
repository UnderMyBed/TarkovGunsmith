/**
 * View-models consumed by the card JSX. `hydrate.ts` produces these; the cards
 * render purely from these objects — no network, no GraphQL, no `@tarkov/data`
 * imports inside the JSX files.
 */
export interface BuildCardViewModel {
  /** Headline text. The build's name if set, else weapon short-name. */
  title: string;
  /** Weapon short-name. Shown under `title` if the build's name was used there. */
  subtitle: string | null;
  /** Number of parts on the weapon, one per filled slot. */
  modCount: number;
  /**
   * The availability pill, in the Builder's words (e.g. `LL3`, `LL4 barter · Flea`, `Locked`),
   * or `null` to leave it off.
   */
  availability: string | null;
  /** Total price in RUB. `null` if any part is missing price data: the pill is left off. */
  priceRub: number | null;
  stats: {
    /** Floored at 0, as the game uses it: the plain sum of base and part deltas can go below. */
    ergo: number;
    recoilV: number;
    recoilH: number;
    /** Kilograms: the weapon's own weight plus every part's. */
    weight: number;
    /** Accuracy in MOA, lower is better. */
    accuracy: number;
  };
}

export interface SideViewModel {
  /** Weapon short-name, e.g. "M4A1". */
  weapon: string;
  modCount: number;
  /** As {@link BuildCardViewModel.availability}. */
  availability: string | null;
  stats: {
    /** As {@link BuildCardViewModel.stats}: floored at 0. */
    ergo: number;
    recoilV: number;
    recoilH: number;
    /** Kilograms: the weapon's own weight plus every part's. */
    weight: number;
  };
}

export interface PairCardViewModel {
  /** Left side — `null` if the user saved the pair with only a right build. */
  left: SideViewModel | null;
  /** Right side — `null` if the user saved the pair with only a left build. */
  right: SideViewModel | null;
}
