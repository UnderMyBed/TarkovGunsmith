import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchWeaponTree, type WeaponTree } from "../queries/weaponTree.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive weapon-with-slots fetch. Cached under `["weapon-tree", weaponId]`.
 * Disabled when weaponId is empty.
 */
export function useWeaponTree(weaponId: string): UseQueryResult<WeaponTree, Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["weapon-tree", weaponId],
    queryFn: () => fetchWeaponTree(client, weaponId),
    enabled: weaponId.length > 0,
  });
}
