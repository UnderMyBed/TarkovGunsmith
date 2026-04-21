import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { loadPair } from "../pairsApi.js";
import type { BuildPair } from "../pair-schema.js";

/**
 * Reactive pair-load by id. Cached under `["pair", id]`. Disabled when id
 * is empty. Errors (including `LoadPairError`) surface on `.error`.
 */
export function useLoadPair(id: string): UseQueryResult<BuildPair, Error> {
  return useQuery({
    queryKey: ["pair", id],
    queryFn: () => loadPair(fetch, id),
    enabled: id.length > 0,
    retry: false,
  });
}
