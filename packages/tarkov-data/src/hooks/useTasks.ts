import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TaskListItem } from "../queries/tasks.js";
import { useBuilderData } from "../provider.js";

/**
 * The quests that gate an offer, from the Builder snapshot: the ones a profile can mark done.
 * Cached under `["tasks"]`.
 */
export function useTasks(): UseQueryResult<TaskListItem[], Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => [...(await source.snapshot()).tasks],
  });
}
