import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchAmmoList } from "../queries/ammoList.js";
import type { AmmoListItem } from "../queries/ammoList.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive ammo list. Cached by TanStack Query under the key `["ammoList"]`.
 */
export function useAmmoList(): UseQueryResult<AmmoListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["ammoList"],
    queryFn: () => fetchAmmoList(client),
  });
}
