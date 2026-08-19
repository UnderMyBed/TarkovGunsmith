import { describe, expect, it } from "vitest";
import {
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
  upgradeLoadedBuild,
  type SlotNodeForMigration,
} from "./build-migrations.js";
import {
  Build,
  CURRENT_BUILD_VERSION,
  type BuildV1,
  type BuildV2,
  type BuildV3,
} from "./build-schema.js";

const v1: BuildV1 = {
  version: 1,
  weaponId: "w1",
  modIds: ["mod-scope-a", "mod-muzzle-a", "mod-unknown"],
  createdAt: "2026-04-20T12:00:00.000Z",
};

function leaf(nameId: string, allowedIds: string[]): SlotNodeForMigration {
  return {
    nameId,
    path: nameId,
    allowedItemIds: new Set(allowedIds),
    children: [],
  };
}

describe("migrateV1ToV2", () => {
  it("places every mod cleanly when the tree unambiguously accepts them", () => {
    const tree = [leaf("mod_scope", ["mod-scope-a"]), leaf("mod_muzzle", ["mod-muzzle-a"])];
    const v2 = migrateV1ToV2(v1, tree);
    expect(v2.version).toBe(2);
    expect(v2.weaponId).toBe("w1");
    expect(v2.attachments).toEqual({
      mod_scope: "mod-scope-a",
      mod_muzzle: "mod-muzzle-a",
    });
    expect(v2.orphaned).toEqual(["mod-unknown"]);
    expect(v2.createdAt).toBe(v1.createdAt);
  });

  it("places a mod in the first accepting slot when multiple match", () => {
    const tree = [leaf("mod_muzzle", ["mod-muzzle-a"]), leaf("mod_muzzle_alt", ["mod-muzzle-a"])];
    const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-muzzle-a"] }, tree);
    expect(v2.attachments).toEqual({ mod_muzzle: "mod-muzzle-a" });
    expect(v2.orphaned).toEqual([]);
  });

  it("puts all mods in orphaned when the tree is empty", () => {
    const v2 = migrateV1ToV2(v1, []);
    expect(v2.attachments).toEqual({});
    expect(v2.orphaned).toEqual(["mod-scope-a", "mod-muzzle-a", "mod-unknown"]);
  });

  it("walks into children when parent slot doesn't match", () => {
    const tree: SlotNodeForMigration[] = [
      {
        nameId: "mod_mount",
        path: "mod_mount",
        allowedItemIds: new Set(),
        children: [
          {
            nameId: "mod_scope",
            path: "mod_mount/mod_scope",
            allowedItemIds: new Set(["mod-scope-a"]),
            children: [],
          },
        ],
      },
    ];
    const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-scope-a"] }, tree);
    expect(v2.attachments).toEqual({ "mod_mount/mod_scope": "mod-scope-a" });
    expect(v2.orphaned).toEqual([]);
  });

  it("deduplicates repeated mod ids (v1 allowed duplicates; v2 does not)", () => {
    const tree = [leaf("mod_muzzle", ["mod-a"])];
    const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-a", "mod-a", "mod-a"] }, tree);
    expect(v2.attachments).toEqual({ mod_muzzle: "mod-a" });
    expect(v2.orphaned).toEqual([]);
  });

  it("caps orphaned at 64 (silent truncation)", () => {
    const manyModIds = Array.from({ length: 200 }, (_, i) => `mod-${i}`);
    const v2 = migrateV1ToV2({ ...v1, modIds: manyModIds }, []);
    expect(v2.orphaned).toHaveLength(64);
  });
});

describe("migrateV2ToV3", () => {
  it("bumps version and preserves all fields", () => {
    const v2: BuildV2 = {
      version: 2,
      weaponId: "w",
      attachments: { s: "m" },
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.weaponId).toBe("w");
    expect(v3.attachments).toEqual({ s: "m" });
    expect(v3.orphaned).toEqual([]);
    expect(v3.profileSnapshot).toBeUndefined();
  });
});

describe("migrateV3ToV4", () => {
  it("bumps version and preserves all fields", () => {
    const v3: BuildV3 = {
      version: 3,
      weaponId: "w",
      attachments: { s: "m" },
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    const v4 = migrateV3ToV4(v3);
    expect(v4.version).toBe(4);
    expect(v4.weaponId).toBe("w");
    expect(v4.attachments).toEqual({ s: "m" });
    expect(v4.name).toBeUndefined();
    expect(v4.description).toBeUndefined();
  });
});

describe("migrateV4ToV5", () => {
  const baseV4 = {
    version: 4 as const,
    weaponId: "w1",
    attachments: [],
    orphaned: [],
    createdAt: new Date(0).toISOString(),
  };

  const withQuests = (completedQuests: string[]) => ({
    ...baseV4,
    profileSnapshot: {
      mode: "advanced" as const,
      traders: {
        prapor: 1,
        therapist: 1,
        skier: 1,
        peacekeeper: 1,
        mechanic: 1,
        ragman: 1,
        jaeger: 1,
      },
      flea: false,
      completedQuests,
    },
  });

  it("remaps a retired gunsmith-part-N name", () => {
    const v5 = migrateV4ToV5(withQuests(["gunsmith-part-3"]));
    expect(v5.profileSnapshot?.completedQuests).toEqual(["gunsmith-master-part-3"]);
  });

  it("remaps part-10 without colliding with part-1", () => {
    const v5 = migrateV4ToV5(withQuests(["gunsmith-part-10", "gunsmith-part-1"]));
    expect(v5.profileSnapshot?.completedQuests).toEqual([
      "gunsmith-master-part-10",
      "gunsmith-master-part-1",
    ]);
  });

  it("leaves already-current names alone", () => {
    const v5 = migrateV4ToV5(withQuests(["gunsmith-m4a1", "setup"]));
    expect(v5.profileSnapshot?.completedQuests).toEqual(["gunsmith-m4a1", "setup"]);
  });

  it("preserves unrecognised names rather than dropping them", () => {
    const v5 = migrateV4ToV5(withQuests(["some-future-quest"]));
    expect(v5.profileSnapshot?.completedQuests).toEqual(["some-future-quest"]);
  });

  it("handles a build with no profile snapshot", () => {
    const v5 = migrateV4ToV5(baseV4);
    expect(v5.version).toBe(5);
    expect(v5.profileSnapshot).toBeUndefined();
  });

  it("handles a snapshot with no completed quests", () => {
    const v5 = migrateV4ToV5({
      ...baseV4,
      profileSnapshot: {
        mode: "basic" as const,
        traders: {
          prapor: 1,
          therapist: 1,
          skier: 1,
          peacekeeper: 1,
          mechanic: 1,
          ragman: 1,
          jaeger: 1,
        },
        flea: false,
      },
    });
    expect(v5.profileSnapshot?.completedQuests).toBeUndefined();
  });

  it("sets version 5", () => {
    expect(migrateV4ToV5(baseV4).version).toBe(5);
  });
});

describe("migrateV5ToV6", () => {
  const profile = {
    mode: "advanced" as const,
    traders: {
      prapor: 4,
      therapist: 3,
      skier: 2,
      peacekeeper: 4,
      mechanic: 3,
      ragman: 2,
      jaeger: 1,
    },
    flea: true,
    level: 1,
    completedQuests: ["gunsmith-master-part-1", "setup"],
  };

  const baseV5 = {
    version: 5 as const,
    weaponId: "w1",
    attachments: { mod_muzzle: "m1" },
    orphaned: ["o1"],
    createdAt: "2026-04-20T00:00:00.000Z",
    name: "RECOIL KING",
    description: "budget",
    profileSnapshot: profile,
  };

  it("sets version 6", () => {
    expect(migrateV5ToV6(baseV5).version).toBe(6);
  });

  it("preserves every field, profileSnapshot included", () => {
    const v6 = migrateV5ToV6(baseV5);
    expect(v6).toEqual({ ...baseV5, version: 6 });
    expect(v6.profileSnapshot).toEqual(profile);
    expect(v6.profileSnapshot?.completedQuests).toEqual(["gunsmith-master-part-1", "setup"]);
  });

  it("handles a build with no profile snapshot", () => {
    const { profileSnapshot: _drop, ...noSnapshot } = baseV5;
    const v6 = migrateV5ToV6(noSnapshot);
    expect(v6.version).toBe(6);
    expect(v6.profileSnapshot).toBeUndefined();
  });

  // It cannot distinguish "author never had a level" from "author chose 1", because
  // Build.safeParse already injected the default before this ran. It must not try.
  it("leaves an explicit level untouched", () => {
    const v6 = migrateV5ToV6({
      ...baseV5,
      profileSnapshot: { ...profile, level: 37 },
    });
    expect(v6.profileSnapshot?.level).toBe(37);
  });
});

describe("upgradeLoadedBuild", () => {
  const shared = {
    weaponId: "w1",
    attachments: { mod_muzzle: "m1" },
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };

  it("carries a v3 build all the way to the current version", () => {
    const v3 = Build.parse({ ...shared, version: 3 });
    const out = upgradeLoadedBuild(v3);
    expect(out.version).toBe(CURRENT_BUILD_VERSION);
    expect(out.version).toBe(6);
    if (out.version === 6) {
      expect(out.weaponId).toBe("w1");
      expect(out.attachments).toEqual({ mod_muzzle: "m1" });
    }
  });

  // v3 → v6 must still run the v4→v5 quest rename, or those unlocks vanish silently.
  it("applies the gunsmith quest rename on the way from v3 to v6", () => {
    const v3 = Build.parse({
      ...shared,
      version: 3,
      profileSnapshot: {
        mode: "advanced",
        traders: {
          prapor: 1,
          therapist: 1,
          skier: 1,
          peacekeeper: 1,
          mechanic: 1,
          ragman: 1,
          jaeger: 1,
        },
        flea: false,
        completedQuests: ["gunsmith-part-4"],
      },
    });
    const out = upgradeLoadedBuild(v3);
    expect(out.version).toBe(6);
    if (out.version === 6) {
      expect(out.profileSnapshot?.completedQuests).toEqual(["gunsmith-master-part-4"]);
      expect(out.profileSnapshot?.level).toBe(1);
    }
  });

  it("carries a v4 build to the current version", () => {
    const v4 = Build.parse({ ...shared, version: 4, name: "Meta M4" });
    const out = upgradeLoadedBuild(v4);
    expect(out.version).toBe(6);
    if (out.version === 6) expect(out.name).toBe("Meta M4");
  });

  it("carries a v5 build to the current version", () => {
    const v5 = Build.parse({ ...shared, version: 5, description: "budget" });
    const out = upgradeLoadedBuild(v5);
    expect(out.version).toBe(6);
    if (out.version === 6) expect(out.description).toBe("budget");
  });

  it("passes a v6 build through untouched", () => {
    const v6 = Build.parse({ ...shared, version: 6 });
    expect(upgradeLoadedBuild(v6)).toEqual(v6);
  });

  // v1/v2 need the weapon's slot tree to place attachments, which no transport has.
  // /builder finishes the job once the tree loads.
  it("leaves v1 and v2 alone — they need the slot tree", () => {
    const v1 = Build.parse({
      version: 1,
      weaponId: "w1",
      modIds: ["m1"],
      createdAt: shared.createdAt,
    });
    expect(upgradeLoadedBuild(v1).version).toBe(1);

    const v2 = Build.parse({ ...shared, version: 2 });
    expect(upgradeLoadedBuild(v2).version).toBe(2);
  });
});
