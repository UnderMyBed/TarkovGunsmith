import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchWeapon } from "../queries/weapon.js";
import type { Weapon } from "../queries/weapon.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive single-weapon fetch by id. Cached by TanStack Query under the key
 * `["weapon", id]`. Disabled when `id` is empty.
 */
export function useWeapon(id: string): UseQueryResult<Weapon, Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["weapon", id],
    queryFn: () => fetchWeapon(client, id),
    enabled: id.length > 0,
  });
}
