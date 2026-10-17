import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TaskListItem } from "../queries/tasks.js";
import { useBuilderData } from "../provider.js";

/** Every task, from the Builder snapshot. Cached under `["tasks"]`. */
export function useTasks(): UseQueryResult<TaskListItem[], Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => [...(await source.snapshot()).tasks],
  });
}
