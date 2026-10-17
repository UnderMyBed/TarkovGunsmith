import { describe, expect, it } from "vitest";
import { fixtureClient } from "../__fixtures__/client.js";
import oracle from "../__fixtures__/preset-oracle-sample.json" with { type: "json" };
import type { ItemsDocument } from "./documents.js";
import { buildSlotGraph } from "./slot-graph.js";
import { selectWeaponPreset, selectWeaponPresets } from "./presets.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const M4A1_CARBINE = "5af08cf886f774223c269184";
const M4A1_SOPMOD = "5a8ae73886f7747b2e6e1416";
const PM_DEFAULT = "58414967245977598f1ad391";
const M4A1_GRIP = "55d4b9964bdc2d1d4e8b456e";
const PACA = "5648a7494bdc2d9d488b4583";
const AKS74UN = "583990e32459771419544dd2";
const TT_GOLDEN = "5b3b713c5acfc4330140bd8d";
const TT_GOLDEN_DEFAULT = "5b44abe986f774283e2e3512";
const SCREW_NUTS = "57347c77245977448d35f6e2"; // a barter item: `properties: null`

interface MutablePreset {
  containsItems: { item: string; count: number }[];
  properties: Record<string, unknown>;
}

async function itemsDoc(capture?: typeof oracle): Promise<ItemsDocument> {
  const client = capture ? fixtureClient({ items: capture }) : fixtureClient();
  return client.fetchResource<ItemsDocument>("items");
}

const select = (doc: ItemsDocument) => selectWeaponPresets(doc, buildSlotGraph(doc));
const preset = (doc: ItemsDocument, id: string) => doc.items[id] as MutablePreset;

describe("selectWeaponPresets", () => {
  it("places every captured weapon preset, the default first, with translated names", async () => {
    const { byWeapon, failures } = select(await itemsDoc());
    expect(failures).toEqual([]);
    expect(Object.keys(byWeapon).sort()).toEqual([M4A1, PM, TT_GOLDEN]);
    expect(byWeapon[M4A1]?.map((p) => [p.id, p.shortName, p.isDefault])).toEqual([
      [M4A1_CARBINE, "M4A1 Carbine", true],
      [M4A1_SOPMOD, "M4A1 SOPMOD II", false],
    ]);
    expect(byWeapon[PM]).toEqual([
      {
        id: PM_DEFAULT,
        name: "Makarov PM 9x18PM pistol Default",
        shortName: "PM Default",
        weaponId: PM,
        isDefault: true,
        attachments: {
          mod_magazine: "5448c12b4bdc2d02308b456f",
          mod_reciever: "6374a822e629013b9c0645c8",
          "mod_reciever/mod_sight_rear": "63c6adcfb4ba094317063742",
          mod_pistolgrip: "6374a7e7417239a7bf00f042",
        },
      },
    ]);
    // The golden TT's default: barrel, grips and magazine, every one placed.
    expect(byWeapon[TT_GOLDEN]?.map((p) => [p.id, Object.values(p.attachments).sort()])).toEqual([
      [
        TT_GOLDEN_DEFAULT,
        ["571a29dc2459771fb2755a6a", "5b3baf8f5acfc40dc5296692", "5b3cadf35acfc400194776a0"],
      ],
    ]);
    // Nested parts land under the part that holds them.
    expect(byWeapon[M4A1]?.[0]?.attachments).toEqual({
      mod_pistol_grip: M4A1_GRIP,
      mod_magazine: "55d4887d4bdc2d962f8b4570",
      mod_reciever: "55d355e64bdc2d962f8b4569",
      "mod_reciever/mod_barrel": "55d3632e4bdc2d972f8b4569",
      "mod_reciever/mod_barrel/mod_muzzle": "544a38634bdc2d58388b4568",
      "mod_reciever/mod_barrel/mod_gas_block": "5ae30e795acfc408fb139a0b",
      "mod_reciever/mod_handguard": "5ae30db85acfc408fb139a05",
      "mod_reciever/mod_handguard/mod_handguard": "637f57a68d137b27f70c4968",
      "mod_reciever/mod_sight_rear": "5ae30bad5acfc400185c2dc4",
      mod_stock: "5649be884bdc2d79388b4577",
      "mod_stock/mod_stock_000": "55d4ae6c4bdc2d8b2f8b456e",
      mod_charge: "55d44fd14bdc2d962f8b456e",
    });
  });

  it("lists the default first, whatever the document order", async () => {
    const doc = await itemsDoc();
    const items = doc.items;
    // Move the Carbine (default) after the SOPMOD II in the document.
    const carbine = items[M4A1_CARBINE];
    delete items[M4A1_CARBINE];
    items[M4A1_CARBINE] = carbine;
    expect(select(doc).byWeapon[M4A1]?.map((p) => p.id)).toEqual([M4A1_CARBINE, M4A1_SOPMOD]);
  });

  it("puts the default before the weapon's other presets", async () => {
    const { byWeapon } = select(await itemsDoc(oracle));
    expect(byWeapon["5bfea6e90db834001b7347f3"]?.map((p) => p.shortName)).toEqual([
      "M700 Default",
      "M700 MRS",
    ]);
  });

  it("reports, and leaves out, a weapon without exactly one default preset", async () => {
    // The oracle capture carries the AKS-74UN's Zenit preset but not its default.
    const { byWeapon, failures } = select(await itemsDoc(oracle));
    expect(byWeapon[AKS74UN]).toBeUndefined();
    expect(failures).toEqual([
      { id: AKS74UN, reason: "default-count", detail: "0 default presets" },
    ]);
  });

  it("ignores presets on gear and on special-slot items", async () => {
    const doc = await itemsDoc();
    preset(doc, PM_DEFAULT).properties.baseItem = PACA;
    preset(doc, TT_GOLDEN_DEFAULT).properties.baseItem = SCREW_NUTS;
    (doc.items[M4A1] as { types: string[] }).types.push("specialSlot");
    expect(select(doc)).toEqual({ byWeapon: {}, failures: [] });
    expect(selectWeaponPreset(doc, buildSlotGraph(doc), "not-an-item")).toBeNull();
  });

  it("reports, never drops, a preset that fails its schema", async () => {
    const doc = await itemsDoc();
    delete preset(doc, PM_DEFAULT).properties.moa;
    const { byWeapon, failures } = select(doc);
    expect(byWeapon[PM]).toBeUndefined();
    expect(failures).toEqual([
      {
        id: PM_DEFAULT,
        reason: "schema",
        detail: "properties.moa: Invalid input: expected number, received undefined",
      },
    ]);
  });

  it("reports every preset when upstream renames baseItem, instead of returning nothing", async () => {
    const doc = await itemsDoc();
    const ids = [PM_DEFAULT, M4A1_CARBINE, M4A1_SOPMOD, TT_GOLDEN_DEFAULT];
    for (const id of ids) {
      const { properties } = preset(doc, id);
      properties.baseItemId = properties.baseItem;
      delete properties.baseItem;
    }
    const { byWeapon, failures } = select(doc);
    expect(byWeapon).toEqual({});
    expect(failures).toHaveLength(ids.length);
    for (const id of ids) {
      expect(failures).toContainEqual({
        id,
        reason: "schema",
        detail: "properties.baseItem: expected a string",
      });
    }
  });

  it("reports a preset whose baseItem names no item", async () => {
    const doc = await itemsDoc();
    preset(doc, PM_DEFAULT).properties.baseItem = "5448bd6b4bdc2dfc2f8b0000";
    expect(select(doc).failures).toEqual([
      { id: PM_DEFAULT, reason: "unknown-items", detail: "5448bd6b4bdc2dfc2f8b0000" },
    ]);
  });

  it("reports a preset whose part fails the part schema", async () => {
    const doc = await itemsDoc();
    delete (doc.items["6374a7e7417239a7bf00f042"] as { conflictingItems?: unknown })
      .conflictingItems;
    expect(select(doc).failures).toEqual([
      {
        id: PM_DEFAULT,
        reason: "schema",
        detail:
          "6374a7e7417239a7bf00f042: conflictingItems: Invalid input: expected array, received undefined",
      },
    ]);
  });

  it("reports a preset naming an item the document lacks", async () => {
    const doc = await itemsDoc();
    delete doc.items["6374a7e7417239a7bf00f042"];
    expect(select(doc).failures).toEqual([
      { id: PM_DEFAULT, reason: "unknown-items", detail: "6374a7e7417239a7bf00f042" },
    ]);
  });

  it("reports a preset whose parts cannot all be placed", async () => {
    const doc = await itemsDoc();
    const grip = preset(doc, M4A1_CARBINE).containsItems.find((c) => c.item === M4A1_GRIP);
    if (grip === undefined) throw new Error("fixture lost the Carbine's grip");
    grip.count = 2;
    const { byWeapon, failures } = select(doc);
    // The SOPMOD II still places, but without its default the weapon is left out.
    expect(byWeapon[M4A1]).toBeUndefined();
    expect(failures).toContainEqual(
      expect.objectContaining({ id: M4A1_CARBINE, reason: "no-fit" }),
    );
    expect(failures).toContainEqual({
      id: M4A1,
      reason: "default-count",
      detail: "0 default presets",
    });
  });
});
