import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchTraders, type TraderListItem } from "../queries/traders.js";
import { useTarkovClient } from "../provider.js";

export function useTraders(): UseQueryResult<TraderListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["traders"],
    queryFn: () => fetchTraders(client),
  });
}
