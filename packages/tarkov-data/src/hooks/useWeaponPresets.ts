import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BuilderSnapshot } from "../snapshot/types.js";
import { snapshotWeaponPresets, type PricedPreset } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";
import { useLivePrices } from "./useLivePrices.js";

/**
 * Every buildable weapon's presets from the Builder snapshot, keyed by weapon id, default
 * first. A weapon without presets is absent. Ready as soon as the snapshot is; offers are
 * priced once live prices arrive, and stay unknown until then or if they fail.
 */
export function useWeaponPresets(): UseQueryResult<Record<string, PricedPreset[]>, Error> {
  const source = useBuilderData();
  const table = useLivePrices().data?.table ?? null;
  const select = useCallback(
    (snapshot: BuilderSnapshot) => snapshotWeaponPresets(snapshot, table),
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
