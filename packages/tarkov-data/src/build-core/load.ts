import type { Build, BuildV2, BuildV6 } from "../build-schema.js";
import {
  legacyV1MigrationSlots,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
  upgradeLoadedBuild,
} from "../build-migrations.js";
import type { BuilderSnapshot } from "../snapshot/types.js";
import { snapshotPartsById, snapshotWeaponTree } from "../snapshot/views.js";
import { applyBuildAction } from "./reducer.js";

/**
 * A saved build of any version, brought to the current one and checked against the game data:
 * the one load path for `/builder/$id`, a loaded comparison's two sides, a build pasted into
 * Compare, and the Builder's handoff to Compare.
 *
 * - v1 places its bare mod ids on the frozen legacy tree (`migrateV1ToV2`): each one in the
 *   first free slot that allows it, and any with no free slot left in `orphaned`. v2 to v5
 *   step up through the migrations.
 * - Every attachment not on the weapon then moves to `orphaned` (`applyBuildAction`'s `load`):
 *   a part beneath an empty parent, one its slot no longer takes, or one the game data no
 *   longer holds. Nothing is dropped, and nothing is capped here. `orphaned` lists ids, so
 *   two copies of one part that are both off the weapon appear in it once.
 * - A build whose weapon the game data no longer holds has no slots to check against: it keeps
 *   every attachment the game data still holds, where it was saved, and orphans the rest. A v1
 *   build's mod ids, which cannot be placed without the weapon, all become orphans.
 */
export function loadSavedBuild(build: Build, snapshot: BuilderSnapshot): BuildV6 {
  const tree = snapshot.weapons.some((w) => w.id === build.weaponId)
    ? snapshotWeaponTree(snapshot, build.weaponId)
    : null;
  const v6 = toV6(build, tree === null ? null : legacyV1MigrationSlots(tree));
  if (tree === null) return orphanUnknown(v6, snapshotPartsById(snapshot));
  const state = applyBuildAction(
    { weaponId: v6.weaponId, attachments: {}, orphaned: [] },
    { type: "load", build: { ...v6, attachments: v6.attachments, orphaned: v6.orphaned } },
    { tree, parts: snapshotPartsById(snapshot) },
  );
  return { ...v6, attachments: state.attachments, orphaned: state.orphaned };
}

function toV6(build: Build, legacy: ReturnType<typeof legacyV1MigrationSlots> | null): BuildV6 {
  if (build.version === 1) {
    const v2: BuildV2 =
      legacy === null
        ? {
            version: 2,
            weaponId: build.weaponId,
            attachments: {},
            orphaned: [...new Set(build.modIds)],
            createdAt: build.createdAt,
          }
        : migrateV1ToV2(build, legacy);
    return fromV2(v2);
  }
  if (build.version === 2) return fromV2(build);
  // v3 and later need nothing but the build itself.
  return upgradeLoadedBuild(build) as BuildV6;
}

function fromV2(v2: BuildV2): BuildV6 {
  return migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(v2))));
}

function orphanUnknown(build: BuildV6, parts: ReadonlyMap<string, unknown>): BuildV6 {
  const attachments: Record<string, string> = {};
  const orphaned = [...build.orphaned];
  for (const [path, itemId] of Object.entries(build.attachments)) {
    if (parts.has(itemId)) attachments[path] = itemId;
    else if (!orphaned.includes(itemId)) orphaned.push(itemId);
  }
  return { ...build, attachments, orphaned };
}
