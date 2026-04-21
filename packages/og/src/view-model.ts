/**
 * View-models consumed by the card JSX. `hydrate.ts` produces these; the cards
 * render purely from these objects — no network, no GraphQL, no `@tarkov/data`
 * imports inside the JSX files.
 */
export interface BuildCardViewModel {
  /** Headline text. `BuildV4.name` if set, else weapon short-name. */
  title: string;
  /** Weapon short-name. Shown under `title` if `BuildV4.name` was used there. */
  subtitle: string | null;
  /** Number of attached mods (sum of `attachments` values). */
  modCount: number;
  /** `FLEA` | `LL2` | `LL3` | `LL4` — lowest trader level that covers every mod. */
  availability: "FLEA" | "LL2" | "LL3" | "LL4";
  /** Total price in RUB. `null` if any mod is missing price data. */
  priceRub: number | null;
  stats: {
    ergo: number | null;
    recoilV: number | null;
    recoilH: number | null;
    weight: number | null;
    accuracy: number | null;
  };
}

export interface SideViewModel {
  /** Weapon short-name, e.g. "M4A1". */
  weapon: string;
  modCount: number;
  availability: "FLEA" | "LL2" | "LL3" | "LL4";
  stats: {
    ergo: number | null;
    recoilV: number | null;
    recoilH: number | null;
    weight: number | null;
  };
}

export interface PairCardViewModel {
  /** Left side — `null` if the user saved the pair with only a right build. */
  left: SideViewModel | null;
  /** Right side — `null` if the user saved the pair with only a left build. */
  right: SideViewModel | null;
}
