import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AttachablePart } from "../queries/parts.js";
import type { BuilderSnapshot } from "../snapshot/types.js";
import { snapshotPartCatalog } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";
import { useLivePrices } from "./useLivePrices.js";

/**
 * Every slot-attachable part (mods, barrels, scopes, magazines, cylinder ammo) from the
 * Builder snapshot. Ready as soon as the snapshot is; offers are priced once live prices
 * arrive, and stay unknown (`priceRUB: null`) until then or if they fail.
 */
export function usePartCatalog(): UseQueryResult<AttachablePart[], Error> {
  const source = useBuilderData();
  const table = useLivePrices().data?.table ?? null;
  const select = useCallback(
    (snapshot: BuilderSnapshot) => snapshotPartCatalog(snapshot, table),
    [table],
  );
  return useQuery({
    queryKey: ["builderSnapshot"],
    queryFn: () => source.snapshot(),
    staleTime: Infinity,
    structuralSharing: false,
    select,
  });
}
