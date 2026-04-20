import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const TASKS_QUERY = /* GraphQL */ `
  query Tasks {
    tasks {
      id
      name
      normalizedName
      kappaRequired
      trader {
        normalizedName
      }
    }
  }
`;

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

const tasksEnvelopeSchema = z.object({
  tasks: z.array(z.unknown()),
});

export async function fetchTasks(client: GraphQLClient): Promise<TaskListItem[]> {
  const raw = await client.request<unknown>(TASKS_QUERY);
  const { tasks } = tasksEnvelopeSchema.parse(raw);
  const out: TaskListItem[] = [];
  for (const task of tasks) {
    const parsed = taskListItemSchema.safeParse(task);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
