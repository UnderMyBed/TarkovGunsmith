import type { BuildV1, BuildV2, BuildV3 } from "./build-schema.js";

/**
 * Minimal shape of a slot node the migration needs. The full `SlotNode` type
 * (exported from `queries/weaponTree.ts` in Task 3) is a superset. We declare
 * a local contract here so the migration stays independent of transport
 * concerns.
 */
export interface SlotNodeForMigration {
  readonly nameId: string;
  readonly path: string; // `/`-joined nameIds from the root
  readonly allowedItemIds: ReadonlySet<string>;
  readonly children: readonly SlotNodeForMigration[];
}

const ORPHANED_CAP = 64;

/**
 * Migrate a v1 build to v2 using the weapon's resolved slot tree.
 *
 * For each `modId` in the v1 build we walk the tree (pre-order) and place
 * the mod in the first slot whose `allowedItemIds` contains it. If no slot
 * accepts the mod, it goes into `orphaned[]`.
 *
 * Duplicates in v1 `modIds` are deduped: once a mod has been placed or
 * orphaned, subsequent occurrences are ignored.
 *
 * Orphaned list is capped at {@link ORPHANED_CAP}; extra entries are silently
 * dropped (the user can always re-enter them manually, and 64 is already a
 * larger bucket than any realistic build could fill).
 */
export function migrateV1ToV2(v1: BuildV1, tree: readonly SlotNodeForMigration[]): BuildV2 {
  const attachments: Record<string, string> = {};
  const orphaned: string[] = [];
  const seen = new Set<string>();

  for (const modId of v1.modIds) {
    if (seen.has(modId)) continue;
    seen.add(modId);

    const path = findSlotPathFor(modId, tree);
    if (path !== null) {
      attachments[path] = modId;
    } else if (orphaned.length < ORPHANED_CAP) {
      orphaned.push(modId);
    }
    // else: silently drop — orphaned list is full.
  }

  return {
    version: 2,
    weaponId: v1.weaponId,
    attachments,
    orphaned,
    createdAt: v1.createdAt,
  };
}

function findSlotPathFor(modId: string, nodes: readonly SlotNodeForMigration[]): string | null {
  for (const node of nodes) {
    if (node.allowedItemIds.has(modId)) return node.path;
    const nested = findSlotPathFor(modId, node.children);
    if (nested !== null) return nested;
  }
  return null;
}

/** v2 → v3 is a no-op apart from the version bump. Profile snapshot is always absent on auto-migration. */
export function migrateV2ToV3(v2: BuildV2): BuildV3 {
  return { ...v2, version: 3 };
}
