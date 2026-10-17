import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LivePrices } from "../prices/fetch.js";
import { useBuilderData } from "../provider.js";

/**
 * Live prices for the Builder, and their age. Cached under `["livePrices"]` and fresh for an
 * hour. After that they are fetched again when the window regains focus or a reader mounts,
 * TanStack Query's defaults; there is no timer. The data source decides whether a fetch may
 * come from the HTTP cache (see `fetchPriceTable`).
 *
 * Nothing waits on this: the weapon list and part catalog render from the snapshot at once
 * and are priced when it resolves. A failure is retried once, then reported through `error`,
 * and every price stays unknown. A failed query is not tried again when another reader
 * mounts: the Builder mounts many readers of it, and each one would otherwise ask upstream
 * anew.
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
