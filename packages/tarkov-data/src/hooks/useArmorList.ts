import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchArmorList } from "../queries/armorList.js";
import type { ArmorListItem } from "../queries/armorList.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive armor list. Cached by TanStack Query under the key `["armorList"]`.
 */
export function useArmorList(): UseQueryResult<ArmorListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["armorList"],
    queryFn: () => fetchArmorList(client),
  });
}
