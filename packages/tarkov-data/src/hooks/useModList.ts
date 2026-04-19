import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchModList } from "../queries/modList.js";
import type { ModListItem } from "../queries/modList.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive WeaponMod list. Cached by TanStack Query under the key `["modList"]`.
 */
export function useModList(): UseQueryResult<ModListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["modList"],
    queryFn: () => fetchModList(client),
  });
}
