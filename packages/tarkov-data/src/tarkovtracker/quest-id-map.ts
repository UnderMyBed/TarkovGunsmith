import type { TaskListItem } from "../queries/tasks.js";

/**
 * Build a gameId → normalizedName map from the SPA's existing Task[] list.
 * First-wins on duplicate gameIds; silently drops tasks with a null id
 * (api.tarkov.dev returns null for pre-release / retired tasks).
 */
export function buildIdMap(tasks: readonly TaskListItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const task of tasks) {
    if (task.id === null) continue;
    if (out[task.id] !== undefined) continue;
    out[task.id] = task.normalizedName;
  }
  return out;
}
