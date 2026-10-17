import type {
  Build,
  BuildV1,
  BuildV2,
  BuildV3,
  BuildV4,
  BuildV5,
  BuildV6,
} from "./build-schema.js";
import { ORPHANED_CAP } from "./build-schema.js";
import { expandSlots, type SlotGraph, type WeaponTree } from "./queries/slot-graph.js";

/**
 * The eager slot tree `migrateV1ToV2` walks: every allowed item's child slots
 * flattened into `children`. Build it with {@link legacyV1MigrationSlots}.
 */
export interface SlotNodeForMigration {
  readonly nameId: string;
  readonly path: string; // `/`-joined nameIds from the root
  readonly allowedItemIds: ReadonlySet<string>;
  readonly children: readonly SlotNodeForMigration[];
}

/** The depth the v1 → v2 placement has always searched to. */
const LEGACY_V1_DEPTH = 3;

/**
 * The tree v1 builds have always been migrated against, rebuilt from the lazy slot graph.
 *
 * v1 builds stored bare mod ids, and `migrateV1ToV2` places each in the first slot (pre-order)
 * that allows it. That placement was computed over a tree three levels deep that recursed only
 * into `ItemPropertiesWeaponMod` children. The live slot tree is deeper and also recurses into
 * barrels and scopes (#214), which would move where an old shared link's mods land. So v1
 * migration keeps its own, frozen view: same depth, same recursion rule, same order, and
 * therefore the same placements for every v1 link ever shared.
 */
export function legacyV1MigrationSlots(tree: WeaponTree): readonly SlotNodeForMigration[] {
  return legacyLevel(tree.graph, tree.weaponId, "", LEGACY_V1_DEPTH);
}

function legacyLevel(
  graph: SlotGraph,
  ownerId: string,
  parentPath: string,
  depth: number,
): SlotNodeForMigration[] {
  if (depth <= 0) return [];
  return expandSlots(graph, ownerId, parentPath).map((slot) => ({
    nameId: slot.nameId,
    path: slot.path,
    allowedItemIds: slot.allowedItemIds,
    children: slot.allowedItems.flatMap((item) =>
      graph.owners[item.id]?.kind === "ItemPropertiesWeaponMod"
        ? legacyLevel(graph, item.id, slot.path, depth - 1)
        : [],
    ),
  }));
}

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

/** v3 → v4 is a no-op apart from the version bump. No name/desc on auto-migrated builds. */
export function migrateV3ToV4(v3: BuildV3): BuildV4 {
  return { ...v3, version: 4 };
}

/**
 * Upstream retired `gunsmith-part-N` in favour of `gunsmith-master-part-N`.
 *
 * Keyed on the exact name rather than a prefix rewrite, so `gunsmith-part-10` cannot be
 * mangled into `gunsmith-master-part-1` + "0".
 */
const RETIRED_QUEST_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`gunsmith-part-${i + 1}`, `gunsmith-master-part-${i + 1}`]),
);

/**
 * v4 → v5 remaps completed quest names onto upstream's restructured Gunsmith series.
 *
 * Saved builds store completed quests as bare strings and live in KV behind share URLs, so
 * without this every build shared before 2026-08-18 would silently lose its Gunsmith unlocks:
 * no error, just fewer mods marked available.
 *
 * Unrecognised names are preserved rather than dropped. A future upstream rename must not
 * become a second silent data loss.
 */
export function migrateV4ToV5(v4: BuildV4): BuildV5 {
  const snapshot = v4.profileSnapshot;
  if (snapshot?.completedQuests === undefined) {
    return { ...v4, version: 5 };
  }
  return {
    ...v4,
    version: 5,
    profileSnapshot: {
      ...snapshot,
      completedQuests: snapshot.completedQuests.map((name) => RETIRED_QUEST_NAMES[name] ?? name),
    },
  };
}

/**
 * v5 → v6 is a pure version bump. There is deliberately no data transform.
 *
 * By the time this runs, the payload has already been through `Build.safeParse`, which
 * injects `profileSnapshot.level = 1` from the schema default. So this function literally
 * cannot distinguish "the author never had a level" from "the author set level 1" — and
 * must not pretend it can. Reaching for a heuristic here (say, deriving a level from
 * `flea`) would be inventing data about a stranger's saved build.
 *
 * What v6 marks is that the reader understood `profileSnapshot.level` — not that the value
 * is trustworthy. Be precise about this, because the obvious stronger claim is false: this
 * function stamps 6 onto v5 builds whose level came from the parser default, and
 * `upgradeLoadedBuild` runs on every load, so re-sharing a migrated build persists a v6
 * record carrying a defaulted level. A v6 stamp therefore does NOT prove the author set a
 * level. Nothing branches on that today; do not add anything that does.
 */
export function migrateV5ToV6(v5: BuildV5): BuildV6 {
  return { ...v5, version: 6 };
}

/**
 * Bring a parsed build forward to the current version, where that can be done without
 * extra inputs.
 *
 * v3, v4 and v5 upgrade cleanly. v1 and v2 are left alone: `migrateV1ToV2` needs the
 * weapon's slot tree to place attachments, which no transport module has access to, so
 * `/builder` performs that step once the tree has loaded.
 *
 * **Every transport that hands a `Build` to the UI must run this.** `/builder/$id` renders
 * the full editor only for the current version, and `useCompareDraft` drops any pair side
 * whose version isn't current — an un-upgraded build doesn't error, it silently vanishes.
 * The quest rename in v5 is invisible the same way: an un-upgraded v4 keeps its retired
 * `gunsmith-part-N` names and just loses those unlocks.
 */
export function upgradeLoadedBuild(build: Build): Build {
  if (build.version === 3) return migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(build)));
  if (build.version === 4) return migrateV5ToV6(migrateV4ToV5(build));
  if (build.version === 5) return migrateV5ToV6(build);
  return build;
}
