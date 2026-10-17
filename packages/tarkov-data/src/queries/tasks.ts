import { z } from "zod";

/**
 * One task as the Builder reads it. Upstream sends `trader` as a bare id; the snapshot
 * generator joins it to the trader's `normalizedName` before validating against this.
 */
export const taskListItemSchema = z.object({
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
