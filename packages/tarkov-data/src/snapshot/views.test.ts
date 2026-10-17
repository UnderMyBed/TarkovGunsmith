import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import { expandSlots } from "../queries/slot-graph.js";
import {
  snapshotPart,
  snapshotPartCatalog,
  snapshotPriceIds,
  snapshotSlotGraph,
  snapshotWeaponPresets,
  snapshotWeaponTree,
} from "./views.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const SCREW_NUTS = "57347c77245977448d35f6e2";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const TT_GOLDEN = "5b3b713c5acfc4330140bd8d";
const M4A1_CARBINE = "5af08cf886f774223c269184";
const M4A1_SOPMOD = "5a8ae73886f7747b2e6e1416";
const PM_DEFAULT = "58414967245977598f1ad391";
const TT_GOLDEN_DEFAULT = "5b44abe986f774283e2e3512";

describe("snapshotSlotGraph", () => {
  it("is built once per snapshot and names every allowed item", async () => {
    const { snapshot } = await fixtureSnapshot();
    const graph = snapshotSlotGraph(snapshot);
    expect(snapshotSlotGraph(snapshot)).toBe(graph);
    expect(snapshotWeaponTree(snapshot, M4A1).graph).toBe(graph);
    expect(graph.owners).toBe(snapshot.slots);
    for (const owner of Object.values(graph.owners)) {
      for (const slot of owner.slots) {
        for (const id of slot.allowedItemIds) {
          expect(graph.itemNames[id]).toBeDefined();
          expect(graph.itemShortNames[id]).toBeDefined();
        }
      }
    }
  });

  it("gives every owner's slots distinct labels across the whole capture", async () => {
    const { snapshot } = await fixtureSnapshot();
    const graph = snapshotSlotGraph(snapshot);
    const owners = Object.keys(graph.owners);
    // The capture holds owners whose upstream names repeat (the M4A1's two "Ch. Handle").
    const repeated = owners.filter((id) => {
      const names = graph.owners[id]!.slots.map((s) => s.name);
      return new Set(names).size !== names.length;
    });
    expect(repeated.length).toBeGreaterThan(0);
    for (const id of owners) {
      const labels = expandSlots(graph, id, "").map((s) => s.label);
      expect(new Set(labels).size, id).toBe(labels.length);
    }
  });
});

describe("snapshotPartCatalog", () => {
  it("fails loudly on a snapshot that lost an item's offers", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const offers = { ...snapshot.offers };
    delete offers[BARREL_10_3];
    expect(() => snapshotPartCatalog({ ...snapshot, offers }, prices.prices)).toThrow(
      `builder-snapshot.json has no offers for ${BARREL_10_3}`,
    );
  });
});

describe("snapshotPart", () => {
  it("prices one part exactly as the catalog does, and knows nothing of other ids", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const fromCatalog = snapshotPartCatalog(snapshot, prices.prices).find(
      (p) => p.id === BARREL_10_3,
    );
    expect(snapshotPart(snapshot, prices.prices, BARREL_10_3)).toEqual(fromCatalog);
    expect(snapshotPart(snapshot, prices.prices, M4A1)).toBeUndefined();
  });
});

describe("snapshotPriceIds", () => {
  it("lists every id an offer's price depends on, sorted", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const ids = snapshotPriceIds(snapshot);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(M4A1);
    expect(ids).toContain(SCREW_NUTS);
    // A preset's own flea listing is priced from the preset's id: the golden TT's preset is
    // sold nowhere else.
    expect(ids).toContain(TT_GOLDEN_DEFAULT);
    // The generator priced exactly these ids that the documents hold.
    for (const id of Object.keys(prices.prices.items)) expect(ids).toContain(id);
  });
});

describe("snapshotWeaponPresets", () => {
  it("leaves every preset price unknown, none unlisted, before prices arrive", async () => {
    const { snapshot } = await fixtureSnapshot();
    const entries = Object.values(snapshotWeaponPresets(snapshot, null)).flatMap((list) =>
      list.flatMap((p) => p.buyFor),
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.priceRUB === null && e.unlisted === undefined)).toBe(true);
  });

  it("marks a preset's flea entry unlisted when the table holds it with no listing", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const table = {
      ...prices.prices,
      items: { ...prices.prices.items, [M4A1_CARBINE]: [null, 96166, 0] as const },
    };
    const carbine = snapshotWeaponPresets(snapshot, table)[M4A1]?.[0];
    expect(carbine?.buyFor.at(-1)).toMatchObject({ priceRUB: null, unlisted: true });
  });

  it("gives each preset its weapon's offers tagged with it, then its own flea listing", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const byWeapon = snapshotWeaponPresets(snapshot, prices.prices);
    expect(Object.keys(byWeapon).sort()).toEqual([M4A1, PM, TT_GOLDEN].sort());
    expect(byWeapon[M4A1]?.map((p) => [p.id, p.isDefault])).toEqual([
      [M4A1_CARBINE, true],
      [M4A1_SOPMOD, false],
    ]);
    const weaponOffers = snapshot.offers[M4A1] ?? [];
    for (const preset of byWeapon[M4A1] ?? []) {
      const tagged = weaponOffers.filter((o) => o.kind !== "flea" && o.preset?.id === preset.id);
      expect(tagged.length).toBeGreaterThan(0);
      expect(preset.buyFor.slice(0, -1).map((e) => e.preset?.id)).toEqual(
        tagged.map(() => preset.id),
      );
    }
    // The Carbine's flea listing needs level 25 and is priced at the preset's own lowest
    // listing (its 24-hour average in the capture is 96,166).
    expect(byWeapon[M4A1]?.[0]?.buyFor.at(-1)).toEqual({
      priceRUB: 26666,
      currency: "RUB",
      vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 25 },
    });
    // Nothing but the flea market sells the golden TT's preset.
    expect(byWeapon[TT_GOLDEN]?.map((p) => [p.id, p.buyFor])).toEqual([
      [
        TT_GOLDEN_DEFAULT,
        [
          {
            priceRUB: 31109,
            currency: "RUB",
            vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 0 },
          },
        ],
      ],
    ]);
    expect(byWeapon[PM]?.[0]?.id).toBe(PM_DEFAULT);
  });

  it("leaves out the flea listing of a preset upstream flags noFlea", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const presets = {
      ...snapshot.presets,
      [TT_GOLDEN]: (snapshot.presets[TT_GOLDEN] ?? []).map((p) => ({ ...p, flea: null })),
    };
    const byWeapon = snapshotWeaponPresets({ ...snapshot, presets }, prices.prices);
    expect(byWeapon[TT_GOLDEN]?.[0]?.buyFor).toEqual([]);
    expect(snapshotPriceIds({ ...snapshot, presets })).not.toContain(TT_GOLDEN_DEFAULT);
  });
});
