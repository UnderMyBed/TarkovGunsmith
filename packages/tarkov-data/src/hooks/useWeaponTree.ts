import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { WeaponTree } from "../queries/slot-graph.js";
import { snapshotWeaponTree } from "../snapshot/views.js";
import { useBuilderData } from "../provider.js";

/**
 * One weapon's slot tree from the Builder snapshot. Cached under `["weapon-tree", weaponId]`.
 * Disabled when weaponId is empty.
 */
export function useWeaponTree(weaponId: string): UseQueryResult<WeaponTree, Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["weapon-tree", weaponId],
    queryFn: async () => snapshotWeaponTree(await source.snapshot(), weaponId),
    enabled: weaponId.length > 0,
    // The tree holds the whole shared slot graph by reference. Structural sharing would deep-walk
    // it on every refetch to preserve references nothing compares.
    structuralSharing: false,
  });
}
