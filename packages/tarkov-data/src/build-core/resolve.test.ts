import { describe, expect, it } from "vitest";
import { fixtureClient } from "../__fixtures__/client.js";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import { tinyTree } from "../__test-utils__/tiny-tree.js";
import type { ConflictFields } from "../conflicts.js";
import { snapshotWeaponTree } from "../snapshot/views.js";
import type { SnapshotPart } from "../snapshot/types.js";
import { resolveBuild } from "./resolve.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const CARBINE = "5af08cf886f774223c269184";
const SOPMOD = "5a8ae73886f7747b2e6e1416";
const HANDGUARD_ID = "5ae30db85acfc408fb139a05";
const COLT_A2_GRIP = "55d4b9964bdc2d1d4e8b456e";
const ADAR_WOODEN_STOCK = "5c0e2ff6d174af02a1659d4a";
const M4SS = "55d4ae6c4bdc2d8b2f8b456e";
const STANAG_MAG = "55d4887d4bdc2d962f8b4570";
const A2_20 = "68a63ac58e1fe612970728f2";
const COLT_A2_FLASH_HIDER = "544a38634bdc2d58388b4568";
const AX15_4 = "63f4ba71f31d4a33b87bd046";
const PEQ15 = "544909bb4bdc2d6f028b4577";
/** The A2 20" barrel's muzzle slot, which the AX-15 4" handguard lists as conflicting. */
const A2_MUZZLE_SLOT = "68a63ac58e1fe612970728f4";
const BOGUS = "000000000000000000000000";

const BARREL = "mod_reciever/mod_barrel";
const MUZZLE = `${BARREL}/mod_muzzle`;
const HANDGUARD = "mod_reciever/mod_handguard";

async function m4a1() {
  const { snapshot } = await fixtureSnapshot(fixtureClient());
  const tree = snapshotWeaponTree(snapshot, M4A1);
  const parts = new Map<string, SnapshotPart>(snapshot.parts.map((p) => [p.id, p]));
  const preset = (id: string) => snapshot.presets[M4A1]!.find((p) => p.id === id)!.attachments;
  return { snapshot, tree, parts, preset };
}

describe("resolveBuild on the captured M4A1", () => {
  it("places a preset whole: nothing orphaned, no clash, every required slot filled", async () => {
    const { tree, parts, preset } = await m4a1();
    const carbine = preset(CARBINE);
    const r = resolveBuild(tree, carbine, parts);
    expect(r.attachments).toEqual(carbine);
    expect(r.placed.map((p) => p.path)).toEqual(Object.keys(r.attachments));
    expect(r.placed.find((p) => p.path === "mod_reciever")?.part.id).toBe(M4A1_UPPER);
    expect(r.orphaned).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.missingRequired).toEqual([]);
  });

  it("resolves every captured preset of every weapon clean", async () => {
    const { snapshot, parts } = await m4a1();
    let checked = 0;
    for (const [weaponId, presets] of Object.entries(snapshot.presets)) {
      const tree = snapshotWeaponTree(snapshot, weaponId);
      for (const preset of presets) {
        const r = resolveBuild(tree, preset.attachments, parts);
        expect({ id: preset.id, orphaned: r.orphaned, conflicts: r.conflicts }).toEqual({
          id: preset.id,
          orphaned: [],
          conflicts: [],
        });
        expect(r.missingRequired.map((s) => s.path)).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("orphans a handguard saved with no upper, and names the empty required slots", async () => {
    const { tree, parts } = await m4a1();
    const r = resolveBuild(
      tree,
      { [HANDGUARD]: HANDGUARD_ID, mod_pistol_grip: COLT_A2_GRIP },
      parts,
    );
    expect(r.attachments).toEqual({ mod_pistol_grip: COLT_A2_GRIP });
    expect(r.orphaned).toEqual([{ path: HANDGUARD, itemId: HANDGUARD_ID, reason: "unreachable" }]);
    expect(r.missingRequired.map((s) => s.path)).toEqual([
      "mod_reciever",
      "mod_stock",
      "mod_charge",
    ]);
  });

  it("orphans a real part its slot does not take, and an id the game data does not hold", async () => {
    const { tree, parts } = await m4a1();
    const r = resolveBuild(tree, { mod_pistol_grip: STANAG_MAG, mod_stock: BOGUS }, parts);
    expect(r.placed).toEqual([]);
    expect(r.orphaned).toEqual([
      { path: "mod_pistol_grip", itemId: STANAG_MAG, reason: "not-allowed" },
      { path: "mod_stock", itemId: BOGUS, reason: "unknown-item" },
    ]);
    // A slot holding a part that is not on the weapon is empty.
    expect(r.missingRequired.map((s) => s.path)).toContain("mod_stock");
    expect(r.missingRequired.map((s) => s.path)).toContain("mod_pistol_grip");
  });

  it("places a part fitted in two slots twice", async () => {
    const { tree, parts, preset } = await m4a1();
    const build = {
      ...preset(SOPMOD),
      [`${HANDGUARD}/mod_tactical`]: PEQ15,
      [`${HANDGUARD}/mod_tactical002`]: PEQ15,
    };
    const r = resolveBuild(tree, build, parts);
    expect(r.placed.filter((p) => p.itemId === PEQ15).map((p) => p.path)).toEqual(
      expect.arrayContaining([`${HANDGUARD}/mod_tactical`, `${HANDGUARD}/mod_tactical002`]),
    );
    expect(r.orphaned).toEqual([]);
  });

  it("reports an item clash on the weapon: the ADAR wooden stock against the M4SS", async () => {
    const { tree, parts, preset } = await m4a1();
    const r = resolveBuild(tree, { ...preset(CARBINE), mod_pistol_grip: ADAR_WOODEN_STOCK }, parts);
    expect(r.conflicts).toEqual([
      {
        kind: "item",
        a: { path: "mod_pistol_grip", itemId: ADAR_WOODEN_STOCK },
        b: { path: "mod_stock/mod_stock_000", itemId: M4SS },
      },
    ]);
    // Flagged, not removed: both stay on the weapon.
    expect(r.attachments["mod_pistol_grip"]).toBe(ADAR_WOODEN_STOCK);
    expect(r.attachments["mod_stock/mod_stock_000"]).toBe(M4SS);
  });

  it("reports a handguard blocking the muzzle slot, naming the blocker first", async () => {
    const { tree, parts } = await m4a1();
    const r = resolveBuild(
      tree,
      {
        mod_reciever: M4A1_UPPER,
        [BARREL]: A2_20,
        [MUZZLE]: COLT_A2_FLASH_HIDER,
        [HANDGUARD]: AX15_4,
      },
      parts,
    );
    expect(r.conflicts).toEqual([
      {
        kind: "slot",
        a: { path: HANDGUARD, itemId: AX15_4 },
        b: { path: MUZZLE, itemId: COLT_A2_FLASH_HIDER },
        slotId: A2_MUZZLE_SLOT,
      },
    ]);
  });
});

describe("resolveBuild — what is not on the weapon", () => {
  const M855A1 = "54527ac44bdc2d36668b4567";
  const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
  const GAS_BLOCK_ID = "5ae30e795acfc408fb139a0b";

  it("orphans a cartridge saved into the magazine slot: the snapshot holds no such part", async () => {
    const { tree, parts } = await m4a1();
    expect(parts.has(M855A1)).toBe(false);
    const r = resolveBuild(tree, { mod_magazine: M855A1, mod_reciever: M4A1_UPPER }, parts);
    expect(r.placed.map((p) => p.itemId)).toEqual([M4A1_UPPER]);
    expect(r.orphaned).toEqual([{ path: "mod_magazine", itemId: M855A1, reason: "unknown-item" }]);
  });

  it("leaves a removed barrel's gas block and muzzle off the weapon, keys or no keys", async () => {
    const { tree, parts } = await m4a1();
    const stale = {
      mod_reciever: M4A1_UPPER,
      [`${BARREL}/mod_gas_block`]: GAS_BLOCK_ID,
      [MUZZLE]: COLT_A2_FLASH_HIDER,
    };
    const r = resolveBuild(tree, stale, parts);
    expect(r.attachments).toEqual({ mod_reciever: M4A1_UPPER });
    expect(r.orphaned.map((o) => [o.path, o.reason])).toEqual([
      [`${BARREL}/mod_gas_block`, "unreachable"],
      [MUZZLE, "unreachable"],
    ]);
    // With the barrel fitted, both are on the weapon.
    expect(
      Object.keys(resolveBuild(tree, { ...stale, [BARREL]: BARREL_10_3 }, parts).attachments),
    ).toHaveLength(4);
  });
});

describe("resolveBuild — structure", () => {
  const fields = (over: Partial<ConflictFields> = {}): ConflictFields => ({
    conflictingItems: [],
    conflictingSlotIds: [],
    ...over,
  });

  it("names the earlier part as the blocker when it blocks a later slot", () => {
    const tree = tinyTree("w", [
      { nameId: "a", items: ["blocker"] },
      { nameId: "b", id: "slot-b", items: ["victim"] },
    ]);
    const parts = new Map([
      ["blocker", fields({ conflictingSlotIds: ["slot-b"] })],
      ["victim", fields()],
    ]);
    expect(resolveBuild(tree, { a: "blocker", b: "victim" }, parts).conflicts).toEqual([
      {
        kind: "slot",
        a: { path: "a", itemId: "blocker" },
        b: { path: "b", itemId: "victim" },
        slotId: "slot-b",
      },
    ]);
  });

  it("places a part attached beneath itself without expanding it again", () => {
    const tree = tinyTree("w", [{ nameId: "a", items: [["p", [{ nameId: "b", items: ["p"] }]]] }]);
    const parts = new Map([["p", fields()]]);
    const r = resolveBuild(tree, { a: "p", "a/b": "p", "a/b/b": "p" }, parts);
    expect(r.attachments).toEqual({ a: "p", "a/b": "p" });
    expect(r.orphaned).toEqual([{ path: "a/b/b", itemId: "p", reason: "unreachable" }]);
  });

  it("lists unreachable paths in path order, and an empty required slot", () => {
    const tree = tinyTree("w", [
      { nameId: "a", required: true, items: [["p", [{ nameId: "c", items: ["q"] }]]] },
    ]);
    const parts = new Map([
      ["p", fields()],
      ["q", fields()],
    ]);
    const r = resolveBuild(tree, { "z/y": "q", "a/c": "q" }, parts);
    expect(r.orphaned.map((o) => o.path)).toEqual(["a/c", "z/y"]);
    expect(r.missingRequired.map((s) => s.path)).toEqual(["a"]);
  });
});
