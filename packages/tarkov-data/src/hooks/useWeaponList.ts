import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchWeaponList } from "../queries/weaponList.js";
import type { WeaponListItem } from "../queries/weaponList.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive weapon list. Cached by TanStack Query under the key `["weaponList"]`.
 */
export function useWeaponList(): UseQueryResult<WeaponListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["weaponList"],
    queryFn: () => fetchWeaponList(client),
  });
}
