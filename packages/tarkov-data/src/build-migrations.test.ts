import { describe, expect, it } from "vitest";
import { migrateV1ToV2, type SlotNodeForMigration } from "./build-migrations.js";
import type { BuildV1 } from "./build-schema.js";

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
