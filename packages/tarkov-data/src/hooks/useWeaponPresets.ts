import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { snapshotWeaponPresets, type PricedPreset } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";

/**
 * Every buildable weapon's presets from the Builder snapshot, keyed by weapon id, default
 * first, each with its offers priced. A weapon without presets is absent. Cached under
 * `["weaponPresets"]`.
 */
export function useWeaponPresets(): UseQueryResult<Record<string, PricedPreset[]>, Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["weaponPresets"],
    queryFn: async () => {
      const [snapshot, prices] = await Promise.all([source.snapshot(), source.prices()]);
      return snapshotWeaponPresets(snapshot, prices);
    },
  });
}
