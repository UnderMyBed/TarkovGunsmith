import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { WeaponListItem } from "../queries/weaponList.js";
import { snapshotWeaponList } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";

/** The buildable weapons from the Builder snapshot, offers priced. Cached under `["weaponList"]`. */
export function useWeaponList(): UseQueryResult<WeaponListItem[], Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["weaponList"],
    queryFn: async () => {
      const [snapshot, prices] = await Promise.all([source.snapshot(), source.prices()]);
      return snapshotWeaponList(snapshot, prices);
    },
  });
}
