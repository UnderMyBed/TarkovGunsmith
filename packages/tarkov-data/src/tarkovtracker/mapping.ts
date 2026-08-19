import type { TaskListItem } from "../queries/tasks.js";
import { buildIdMap } from "./quest-id-map.js";
import type { MapResult, RawProgression } from "./types.js";

/**
 * Pure mapper: TarkovTracker progression + tarkov.dev task list → the subset
 * of `PlayerProfile` we can derive (completedQuests + flea + level).
 *
 * - Skips tasks that are incomplete / invalid / failed (per spec §6.2).
 * - Skips tasks whose gameId has no normalizedName match and increments
 *   `unmappedCount` so callers can surface the count to users.
 */
export function mapRawToProfile(raw: RawProgression, tasks: readonly TaskListItem[]): MapResult {
  const idMap = buildIdMap(tasks);
  const normalized: string[] = [];
  let unmappedCount = 0;

  for (const entry of raw.tasksProgress) {
    if (!entry.complete || entry.invalid === true || entry.failed === true) continue;
    const slug = idMap[entry.id];
    if (slug !== undefined) {
      normalized.push(slug);
    } else {
      unmappedCount++;
    }
  }

  return {
    profile: {
      completedQuests: normalized,
      // The `>= 20` flea-unlock threshold is carried over from the original mapper and is
      // UNVERIFIED against the live game — BSG has moved this level between patches. It is
      // a separate concern from `level` below, which is the raw PMC level the per-offer
      // `minLevelForFlea` gate in `itemAvailability` reads. Left as-is deliberately;
      // changing it is a behaviour change that wants its own check against upstream.
      flea: raw.playerLevel >= 20,
      // TarkovTracker's schema allows 0 (`playerLevel: z.number().int().nonnegative()`),
      // while `PlayerProfile.level`'s range is 1–99. Clamp to both bounds rather than hand
      // `PlayerProfile.parse` a value it would reject — a rejected profile is a silent
      // reset, not a visible error.
      level: Math.min(99, Math.max(1, raw.playerLevel)),
    },
    meta: {
      questCount: normalized.length,
      playerLevel: raw.playerLevel,
      unmappedCount,
    },
  };
}
