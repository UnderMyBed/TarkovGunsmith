import type { TaskListItem } from "../queries/tasks.js";
import { buildIdMap } from "./quest-id-map.js";
import type { MapResult, RawProgression } from "./types.js";

/**
 * Pure mapper: TarkovTracker progression + tarkov.dev task list → the subset
 * of `PlayerProfile` we can derive (completedQuests + flea).
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
      flea: raw.playerLevel >= 20,
    },
    meta: {
      questCount: normalized.length,
      playerLevel: raw.playerLevel,
      unmappedCount,
    },
  };
}
