import {
  itemAvailability,
  type AvailabilityInput,
  type BuildPrice,
  type BuilderMode,
  type PriceGate,
} from "@tarkov/data";
// Pure and React-free: the Builder's own rule for what an item's pill shows.
import { shownAvailability } from "../../src/features/builder/shown-availability.js";

/** What the card's availability pill is drawn from: the build as the card prices it. */
export interface PillInput {
  /** The build's weapon, as `snapshotWeaponList` gives it (the Builder's weapon picker). */
  weapon: AvailabilityInput;
  /** Each distinct part on the weapon, as `snapshotPart` gives it (the Builder's catalog). */
  parts: readonly AvailabilityInput[];
}

/**
 * The share card's availability pill, in the Builder's own words.
 *
 * Each item's availability is the Builder's: `itemAvailability` under `gate`, through
 * `shownAvailability` for the mode the gate implies (no gate is theorycraft). So a part
 * nobody sells is not shown as gated in theorycraft.
 *
 * - `LOCKED` when `gate` is a profile and the build cannot be bought under it
 *   (`price.status === "unobtainable"`, the same rule as Compare's LOCKED). A part the
 *   bought preset supplies is not a lock.
 * - Otherwise the obtainable items summed up in the tokens of the Builder's per-item pills
 *   (`availabilityLabel`): `LL{n}` for the highest trader level any path needs, with
 *   ` BARTER` when some path is a barter; `FLEA` when some path is the flea; `QUEST` when
 *   some path assumes a quest is done. Joined with ` · `. For a build of one item this is
 *   exactly that item's Builder pill.
 * - `null` when no item has a path to show; the card then leaves the pill off.
 *
 * `price` is `buildPriceUnder(gate, …)` over the same weapon and parts.
 */
export function availabilityPill(
  gate: PriceGate,
  input: PillInput,
  price: BuildPrice,
): string | null {
  if (gate !== null && price.status === "unobtainable") return "LOCKED";
  const mode: BuilderMode = gate === null ? "theorycraft" : "progression";

  let level: number | null = null;
  let barter = false;
  let flea = false;
  let quest = false;
  for (const item of [input.weapon, ...input.parts]) {
    const shown = shownAvailability(mode, itemAvailability(item, gate));
    // Hidden (theorycraft, nobody sells it), or under a profile a part the bought preset
    // supplies: the price above says the build can be had, so it is not a lock.
    if (shown === null || !shown.available) continue;
    if (shown.kind === "flea") {
      flea = true;
      continue;
    }
    level = Math.max(level ?? shown.minLevel, shown.minLevel);
    if (shown.kind === "barter") barter = true;
    if (shown.assumedQuest !== null) quest = true;
  }

  const tokens: string[] = [];
  if (level !== null) tokens.push(barter ? `LL${level} BARTER` : `LL${level}`);
  if (flea) tokens.push("FLEA");
  if (quest) tokens.push("QUEST");
  return tokens.length === 0 ? null : tokens.join(" · ");
}
