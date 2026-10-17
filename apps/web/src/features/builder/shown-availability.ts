import type { BuilderMode, ItemAvailability } from "@tarkov/data";

/**
 * The availability to show for an item in `mode`. In theorycraft every gate is open, so the
 * only items still unavailable are the ones nothing sells (`no-sources`, `flea-unlisted`); the
 * mode promises everything unlocked, so they show no availability at all, neither dimmed nor
 * LOCKED. Available items keep theirs, which names where they are bought. Progression shows
 * every availability as it is.
 */
export function shownAvailability(
  mode: BuilderMode,
  availability: ItemAvailability | null,
): ItemAvailability | null {
  return mode === "theorycraft" && availability?.available === false ? null : availability;
}

/**
 * The text of an item's availability pill: `LL2`, `LL3 BARTER` or `FLEA` for the path it is
 * bought by, with ` · QUEST` when that path assumes a quest is done; `LOCKED` when no path is
 * open.
 */
export function availabilityLabel(availability: ItemAvailability): string {
  if (!availability.available) return "LOCKED";
  if (availability.kind === "flea") return "FLEA";
  const level = `LL${availability.minLevel}`;
  const head = availability.kind === "barter" ? `${level} BARTER` : level;
  return availability.assumedQuest === null ? head : `${head} · QUEST`;
}
