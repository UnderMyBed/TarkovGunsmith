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
  /** `FLEA` | `LL2` | `LL3` | `LL4` — lowest trader level that covers every mod. */
  availability: "FLEA" | "LL2" | "LL3" | "LL4";
  /** Total price in RUB. `null` if any part is missing price data: the pill is left off. */
  priceRub: number | null;
  stats: {
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
  availability: "FLEA" | "LL2" | "LL3" | "LL4";
  stats: {
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
