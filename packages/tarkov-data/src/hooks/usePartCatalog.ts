import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AttachablePart } from "../queries/parts.js";
import { snapshotPartCatalog } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";

/**
 * Every slot-attachable part (mods, barrels, scopes, magazines, cylinder ammo) from the
 * Builder snapshot, offers priced. Cached under `["partCatalog"]`.
 */
export function usePartCatalog(): UseQueryResult<AttachablePart[], Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["partCatalog"],
    queryFn: async () => {
      const [snapshot, prices] = await Promise.all([source.snapshot(), source.prices()]);
      return snapshotPartCatalog(snapshot, prices);
    },
  });
}
