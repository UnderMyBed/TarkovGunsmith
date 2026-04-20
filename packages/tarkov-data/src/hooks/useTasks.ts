import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchTasks, type TaskListItem } from "../queries/tasks.js";
import { useTarkovClient } from "../provider.js";

export function useTasks(): UseQueryResult<TaskListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(client),
  });
}
