import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LivePrices } from "../prices/fetch.js";
import { useBuilderData } from "../provider.js";

/**
 * Live prices for the Builder, and their age. Cached under `["livePrices"]` for an hour; the
 * data source decides how fresh a fetch is (see `fetchPriceTable`).
 *
 * Nothing waits on this: the weapon list and part catalog render from the snapshot at once
 * and are priced when it resolves. A failure is retried once, then reported through `error`,
 * and every price stays unknown. A component mounting later does not fetch again: the Builder
 * mounts many readers of this query, and each one would otherwise ask upstream anew.
 */
export function useLivePrices(): UseQueryResult<LivePrices, Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["livePrices"],
    queryFn: () => source.prices(),
    staleTime: 3_600_000,
    retry: 1,
    retryOnMount: false,
    structuralSharing: false,
  });
}
