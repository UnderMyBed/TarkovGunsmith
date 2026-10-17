import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { isProfileTrader, type TraderListItem } from "../queries/traders.js";
import { useBuilderData } from "../provider.js";

/**
 * The 7 traders whose loyalty level the profile records (no Fence, Ref, Lightkeeper), from
 * the Builder snapshot. Cached under `["traders"]`.
 */
export function useTraders(): UseQueryResult<TraderListItem[], Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["traders"],
    queryFn: async () => (await source.snapshot()).traders.filter(isProfileTrader),
  });
}
