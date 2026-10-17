import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { WeaponListItem } from "../queries/weaponList.js";
import type { BuilderSnapshot } from "../snapshot/types.js";
import { snapshotWeaponList } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";
import { useLivePrices } from "./useLivePrices.js";

/**
 * The buildable weapons from the Builder snapshot. Ready as soon as the snapshot is; offers
 * are priced once live prices arrive, and stay unknown until then or if they fail.
 */
export function useWeaponList(): UseQueryResult<WeaponListItem[], Error> {
  const source = useBuilderData();
  const table = useLivePrices().data?.table ?? null;
  const select = useCallback(
    (snapshot: BuilderSnapshot) => snapshotWeaponList(snapshot, table),
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
