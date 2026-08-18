import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { TasksDocument } from "./documents.js";
import type { TradersDocument } from "./traders.js";

const taskListItemSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  normalizedName: z.string(),
  kappaRequired: z.boolean().nullable(),
  trader: z.object({
    normalizedName: z.string(),
  }),
});

export const tasksSchema = z.object({
  tasks: z.array(taskListItemSchema),
});

export type TaskListItem = z.infer<typeof taskListItemSchema>;

/**
 * Fetch the task list.
 *
 * Tasks carry `trader` as a bare id where the GraphQL API embedded `{ normalizedName }`, so
 * the traders document is fetched alongside and joined in. Both come from the client's cache,
 * so this is one network round trip in practice.
 *
 * A task whose trader id resolves to nothing is dropped rather than emitted with an empty
 * trader: availability gating compares on `normalizedName`, and a blank one would silently
 * match nothing instead of failing visibly.
 */
export async function fetchTasks(client: TarkovJsonClient): Promise<TaskListItem[]> {
  const [doc, traderDoc] = await Promise.all([
    client.fetchResource<TasksDocument>("tasks"),
    client.fetchResource<TradersDocument>("traders"),
  ]);

  const normalizedNameById = new Map<string, string>();
  for (const raw of Object.values(traderDoc)) {
    if (raw === null || typeof raw !== "object") continue;
    const { id, normalizedName } = raw as { id?: unknown; normalizedName?: unknown };
    if (typeof id === "string" && typeof normalizedName === "string") {
      normalizedNameById.set(id, normalizedName);
    }
  }

  const out: TaskListItem[] = [];
  for (const raw of Object.values(doc.tasks)) {
    if (raw === null || typeof raw !== "object") continue;
    const traderId = (raw as { trader?: unknown }).trader;
    const normalizedName =
      typeof traderId === "string" ? normalizedNameById.get(traderId) : undefined;
    if (normalizedName === undefined) continue;

    const parsed = taskListItemSchema.safeParse({ ...raw, trader: { normalizedName } });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
