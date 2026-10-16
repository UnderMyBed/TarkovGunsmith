import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchPartCatalog, type AttachablePart } from "../queries/parts.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive catalog of every slot-attachable part (mods, barrels, scopes, magazines,
 * cylinder ammo). Cached under `["partCatalog"]`.
 */
export function usePartCatalog(): UseQueryResult<AttachablePart[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["partCatalog"],
    queryFn: () => fetchPartCatalog(client),
  });
}
