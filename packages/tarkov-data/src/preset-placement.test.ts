import { describe, expect, it } from "vitest";
import { fixtureClient } from "./__fixtures__/client.js";
import oracle from "./__fixtures__/preset-oracle-sample.json" with { type: "json" };
import { buildSlotGraph, selectWeaponTree } from "./queries/slot-graph.js";
import type { ItemsDocument } from "./queries/documents.js";
import type { ConflictFields } from "./conflicts.js";
import { placePreset, type PresetPart } from "./preset-placement.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const M4A1_GRIP = "55d4b9964bdc2d1d4e8b456e";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const AEROKNOX_10_5 = "619b5db699fb192e7430664f";
const PM_GRIP = "6374a7e7417239a7bf00f042";
const M4A1_CARBINE = "5af08cf886f774223c269184";
const M700_MRS = "5d38517786f7742a1468cf6a";
const KEYMOD_RAIL = "5a9d6d00a2750c5c985b5305";
const AKS74UN_ZENIT = "5a43a85186f7746c914b947a";
const CARTRIDGE_545_BP = "56dfef82d2720bbd668b4567";

interface RawRecord {
  types?: string[];
  conflictingItems?: string[];
  conflictingSlotIds?: string[];
  containsItems?: { item: string; count: number }[];
  properties?: { baseItem?: string } | null;
}

async function load(capture?: typeof oracle) {
  const client = capture ? fixtureClient({ items: capture }) : fixtureClient();
  const doc = await client.fetchResource<ItemsDocument>("items");
  const graph = buildSlotGraph(doc);
  const record = (id: string) => doc.items[id] as RawRecord;
  const conflicts = new Map<string, ConflictFields>(
    Object.keys(doc.items).map((id) => [
      id,
      {
        conflictingItems: record(id).conflictingItems ?? [],
        conflictingSlotIds: record(id).conflictingSlotIds ?? [],
      },
    ]),
  );
  const isCartridge = (id: string) => (record(id).types ?? []).includes("ammo");
  const place = (weaponId: string, parts: PresetPart[], maxNodes?: number) =>
    placePreset({
      tree: selectWeaponTree(doc, weaponId, graph),
      parts,
      isCartridge,
      conflicts,
      ...(maxNodes === undefined ? {} : { maxNodes }),
    });
  const presetParts = (presetId: string) => {
    const preset = record(presetId);
    const weaponId = preset.properties?.baseItem as string;
    const parts = (preset.containsItems ?? [])
      .filter((c) => c.item !== weaponId)
      .map((c) => ({ itemId: c.item, count: c.count }));
    return { weaponId, parts };
  };
  return { place, presetParts };
}

describe("placePreset over real upstream presets", () => {
  it("places a part listed three times in three slots (counts are physical parts)", async () => {
    const { place, presetParts } = await load(oracle);
    const { weaponId, parts } = presetParts(M700_MRS);
    expect(parts.find((p) => p.itemId === KEYMOD_RAIL)?.count).toBe(3);

    const result = place(weaponId, parts);
    if (!result.placed) throw new Error(`unplaced: ${result.reason}`);
    const railPaths = Object.entries(result.attachments)
      .filter(([, id]) => id === KEYMOD_RAIL)
      .map(([path]) => path);
    expect(railPaths).toEqual([
      "mod_stock/mod_handguard/mod_mount_000",
      "mod_stock/mod_handguard/mod_mount_001",
      "mod_stock/mod_handguard/mod_mount_002",
    ]);
  });

  it("returns loaded rounds as cartridges instead of slotting them", async () => {
    const { place, presetParts } = await load(oracle);
    const { weaponId, parts } = presetParts(AKS74UN_ZENIT);
    const result = place(weaponId, parts);
    if (!result.placed) throw new Error(`unplaced: ${result.reason}`);
    expect(result.cartridges).toEqual([{ itemId: CARTRIDGE_545_BP, count: 30 }]);
    expect(Object.values(result.attachments)).not.toContain(CARTRIDGE_545_BP);
  });

  it("settles an ambiguous preset on the earliest slot in pre-order, every time", async () => {
    // The Zenit's EOTech, rail mount and LS321 fit several slots; this is the placement the
    // tie-break picks. Any other valid placement holds the same parts, so the same stats.
    const { place, presetParts } = await load(oracle);
    const { weaponId, parts } = presetParts(AKS74UN_ZENIT);
    const expected = {
      mod_pistol_grip: "5649ae4a4bdc2d1b2b8b4588",
      mod_stock: "59ecc28286f7746d7a68aa8c",
      "mod_stock/mod_stock": "59ecc3dd86f7746dc827481c",
      mod_charge: "5648ac824bdc2ded0b8b457d",
      mod_magazine: "55d480c04bdc2d1d4e8b456a",
      mod_muzzle: "5649ab884bdc2ded0b8b457f",
      mod_reciever: "57dc334d245977597164366f",
      "mod_reciever/mod_mount_000": "57ffb0062459777a045af529",
      "mod_reciever/mod_mount_000/mod_scope": "584924ec24597768f12ae244",
      mod_gas_block: "59d36a0086f7747e673f3946",
      "mod_gas_block/mod_handguard": "57ffa9f4245977728561e844",
      "mod_gas_block/mod_handguard/mod_foregrip": "59fc48e086f77463b1118392",
      "mod_gas_block/mod_handguard/mod_tactical_000": "57ffaea724597779f52b3a4d",
      "mod_gas_block/mod_handguard/mod_tactical_000/mod_scope": "57fd23e32459772d0805bcf1",
    };
    expect(place(weaponId, parts)).toMatchObject({ placed: true, attachments: expected });
    expect(place(weaponId, parts)).toMatchObject({ placed: true, attachments: expected });
  });
});

describe("placePreset failures", () => {
  it("names the parts no slot on the weapon can ever take", async () => {
    const { place } = await load();
    expect(
      place(M4A1, [
        { itemId: M4A1_GRIP, count: 1 },
        { itemId: PM_GRIP, count: 1 },
      ]),
    ).toEqual({ placed: false, reason: "unreachable", itemIds: [PM_GRIP] });
  });

  it("reports no-fit when reachable parts outnumber their slots", async () => {
    const { place } = await load();
    expect(place(M4A1, [{ itemId: M4A1_GRIP, count: 2 }])).toEqual({
      placed: false,
      reason: "no-fit",
      itemIds: [M4A1_GRIP],
    });
  });

  it("adds up a part listed in two entries", async () => {
    const { place } = await load();
    expect(
      place(M4A1, [
        { itemId: M4A1_GRIP, count: 1 },
        { itemId: M4A1_GRIP, count: 1 },
      ]),
    ).toMatchObject({ placed: false, reason: "no-fit" });
  });

  it("never fits a part where it conflicts", async () => {
    // Upstream lists the AX-15 10.5" handguard and the 10.3" barrel as a conflicting pair, and
    // the upper is the only place either goes, so they cannot both be fitted.
    const { place } = await load();
    expect(
      place(M4A1, [
        { itemId: M4A1_UPPER, count: 1 },
        { itemId: BARREL_10_3, count: 1 },
        { itemId: AEROKNOX_10_5, count: 1 },
      ]),
    ).toEqual({
      placed: false,
      reason: "no-fit",
      itemIds: [M4A1_UPPER, BARREL_10_3, AEROKNOX_10_5],
    });
    // Either one alone fits.
    expect(
      place(M4A1, [
        { itemId: M4A1_UPPER, count: 1 },
        { itemId: AEROKNOX_10_5, count: 1 },
      ]),
    ).toMatchObject({ placed: true });
  });

  it("places a preset with nothing to slot, whatever the node limit", async () => {
    const { place } = await load(oracle);
    expect(place("583990e32459771419544dd2", [{ itemId: CARTRIDGE_545_BP, count: 30 }], 0)).toEqual(
      {
        placed: true,
        attachments: {},
        cartridges: [{ itemId: CARTRIDGE_545_BP, count: 30 }],
      },
    );
  });

  it("gives up at the node limit", async () => {
    const { place, presetParts } = await load();
    const { weaponId, parts } = presetParts(M4A1_CARBINE);
    const result = place(weaponId, parts, 1);
    expect(result).toMatchObject({ placed: false, reason: "node-limit" });
    expect(result.placed ? [] : result.itemIds).toHaveLength(parts.length);
    expect(place(weaponId, parts)).toMatchObject({ placed: true });
  });
});
