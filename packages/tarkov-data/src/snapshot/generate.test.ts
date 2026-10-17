import { describe, expect, it } from "vitest";
import { fixtureClient } from "../__fixtures__/client.js";
import itemsCapture from "../__fixtures__/items-sample.json" with { type: "json" };
import legacyBuyFor from "../__fixtures__/legacy-buy-for.json" with { type: "json" };
import {
  buildBuilderSnapshot,
  fetchSnapshotDocuments,
  SnapshotDriftError,
  type SnapshotDocuments,
} from "./generate.js";
import { snapshotPartCatalog, snapshotWeaponList } from "./views.js";
import type { Barter } from "../queries/barters.js";
import type { ItemsDocument } from "../queries/documents.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const SP81 = "620109578d82e67e7911abf2";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const GRENADE = "5448be9a4bdc2dfd2f8b456a";
const SCREW_NUTS = "57347c77245977448d35f6e2"; // the PM preset barter's input

const docs = (): Promise<SnapshotDocuments> => fetchSnapshotDocuments(fixtureClient());
const M855A1 = "54527ac44bdc2d36668b4567"; // a cartridge: part-typed, in no weapon slot
const PRAPOR = "54cb50c76803fa8b248b4571";
const WILCOX = "5c11046cd174af02a012e42b"; // PVS-7 Wilcox adapter: a helmet mount

/** A barter in the documents whose reward is a part the snapshot carries. */
function barterRewardingAPart(input: SnapshotDocuments): Barter {
  const { snapshot } = buildBuilderSnapshot(structuredClone(input), "fixtures");
  const partIds = new Set(snapshot.parts.map((p) => p.id));
  return (input.barters as Barter[]).find((b) => partIds.has(b.offeredItem.item))!;
}

/** A part in the documents with its own cash offer. */
function cashSeller(input: SnapshotDocuments): string {
  const { snapshot } = buildBuilderSnapshot(structuredClone(input), "fixtures");
  return snapshot.parts.find((p) =>
    snapshot.offers[p.id]!.some((o) => o.kind === "cash" && o.preset === undefined),
  )!.id;
}

type Mutable = Record<string, Record<string, unknown>>;

function driftOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof SnapshotDriftError) return error.problems;
    throw error;
  }
  throw new Error("expected a SnapshotDriftError");
}

describe("buildBuilderSnapshot over the captured documents", () => {
  it("records its source, schema and the newest upstream `updated` as dataAsOf", async () => {
    const { snapshot, prices } = buildBuilderSnapshot(await docs(), "fixtures");
    const newest = Object.values(
      itemsCapture.document.data.items as Record<string, { updated?: string }>,
    )
      .map((i) => i.updated ?? "")
      .sort()
      .at(-1);
    expect(snapshot).toMatchObject({ schema: 1, source: "fixtures", dataAsOf: newest });
    expect(prices).toMatchObject({ schema: 1, source: "fixtures", dataAsOf: newest });
  });

  it("keeps buildable weapons only, sorted by id", async () => {
    const { snapshot } = buildBuilderSnapshot(await docs(), "fixtures");
    const ids = snapshot.weapons.map((w) => w.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toEqual(expect.arrayContaining([M4A1, PM]));
    expect(ids).not.toContain(SP81);
    for (const weapon of snapshot.weapons) expect(weapon).not.toHaveProperty("buyFor");
  });

  it("carries exactly the parts a weapon can reach, and their slots", async () => {
    const { snapshot } = buildBuilderSnapshot(await docs(), "fixtures");
    const partIds = new Set(snapshot.parts.map((p) => p.id));
    expect(partIds.has(BARREL_10_3)).toBe(true);
    for (const owner of Object.values(snapshot.slots)) {
      for (const slot of owner.slots) {
        for (const id of slot.allowedItemIds) expect(partIds.has(id)).toBe(true);
      }
    }
    expect(Object.keys(snapshot.slots)).toContain(M4A1);
    expect(Object.keys(snapshot.offers).sort()).toEqual(
      [...snapshot.weapons.map((w) => w.id), ...partIds].sort(),
    );
  });

  it("prices every weapon and part exactly as the resolver it replaced did", async () => {
    // legacy-buy-for.json is what main's `fetchOfferResolver` (at 2b8c53b, before the split
    // into unpriced offers plus a price table) returned for each of these items over these
    // same captures. Pinned values, so the split cannot drift by agreeing with itself.
    const { snapshot, prices } = buildBuilderSnapshot(await docs(), "fixtures");
    const items = [
      ...snapshotWeaponList(snapshot, prices.prices),
      ...snapshotPartCatalog(snapshot, prices.prices),
    ];
    expect(items.map((i) => i.id).sort()).toEqual(Object.keys(legacyBuyFor).sort());
    for (const item of items) {
      expect(item.buyFor, item.id).toEqual(legacyBuyFor[item.id as keyof typeof legacyBuyFor]);
    }
  });

  it("names barter inputs that are neither weapons nor parts", async () => {
    const { snapshot } = buildBuilderSnapshot(await docs(), "fixtures");
    expect(snapshot.ingredientNames[SCREW_NUTS]).toMatch(/nuts/i);
    expect(snapshot.ingredientNames).not.toHaveProperty(M4A1);
  });

  it("joins tasks to their trader and keeps every trader", async () => {
    const { snapshot } = buildBuilderSnapshot(await docs(), "fixtures");
    expect(snapshot.tasks.map((t) => t.normalizedName)).toContain("gunsmith-m4a1");
    for (const task of snapshot.tasks) expect(task.trader.normalizedName).not.toBe("");
    expect(snapshot.traders.map((t) => t.normalizedName)).toEqual(
      expect.arrayContaining(["prapor", "ref", "fence"]),
    );
  });

  it("is byte-identical across runs", async () => {
    const a = buildBuilderSnapshot(await docs(), "fixtures");
    const b = buildBuilderSnapshot(await docs(), "fixtures");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("names and prices a barter input that is part-typed but no weapon reaches", async () => {
    // The PVS-7 Wilcox adapter: a real ItemPropertiesWeaponMod with a flea price, mounted on
    // helmets, so no weapon slot reaches it and it is not among the snapshot's parts.
    const input = await docs();
    const barter = barterRewardingAPart(input);
    barter.requiredItems.push({ item: WILCOX, count: 2, attributes: {} });
    // A part the snapshot carries is named in the catalog, not here.
    barter.requiredItems.push({ item: BARREL_10_3, count: 1, attributes: {} });
    const { snapshot, prices } = buildBuilderSnapshot(input, "fixtures");
    expect(snapshot.parts.some((p) => p.id === WILCOX)).toBe(false);
    expect(snapshot.ingredientNames[WILCOX]).toBe("PVS-7 Wilcox Adapter");
    expect(snapshot.ingredientNames).not.toHaveProperty(BARREL_10_3);
    const part = snapshotPartCatalog(snapshot, prices.prices).find(
      (p) => p.id === barter.offeredItem.item,
    )!;
    const priced = part.buyFor!.find(
      (o) => o.vendor.__typename === "TraderBarter" && o.vendor.barterId === barter.id,
    )!;
    expect(priced.vendor).toMatchObject({ costUnavailableReason: null });
    expect(priced.priceRUB).toBeGreaterThan(0);
  });
});

describe("buildBuilderSnapshot on drift", () => {
  it("fails on documents of the wrong shape, naming each", () => {
    const problems = driftOf(() =>
      buildBuilderSnapshot(
        { items: null, tasks: {}, traders: [], barters: {} } as unknown as SnapshotDocuments,
        "upstream",
      ),
    );
    expect(problems).toEqual([
      "barters: expected an array",
      "items: expected `items` map",
      "tasks: expected `tasks` map",
      "traders: expected an id-keyed object",
    ]);
  });

  it("fails on a weapon or reachable part that no longer matches its schema, naming it", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    delete items[BARREL_10_3]!.conflictingSlotIds;
    (items[PM]!.properties as Record<string, unknown>).fireRate = "fast";
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems).toEqual([
      `items/${PM} (ItemPropertiesWeapon): properties.fireRate: Invalid input: expected number, received string`,
      `items/${BARREL_10_3} (ItemPropertiesBarrel): conflictingSlotIds: Invalid input: expected array, received undefined`,
    ]);
  });

  it("does not fail on records the Builder never reads", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    // A part-typed item no weapon reaches, and a special-slot weapon, both broken.
    delete items[M855A1]!.weight;
    (items[SP81]!.properties as Record<string, unknown>).fireRate = "fast";
    // A barter for something that is neither a weapon nor a part, broken.
    input.barters.push({ id: "unrelated", offeredItem: { item: GRENADE, count: 1 } });
    // Two disagreeing copies of a trader offer on an item no offer depends on.
    items[GRENADE]!.buyFromTrader = [
      { trader: PRAPOR, priceRUB: 1, currency: "RUB", minTraderLevel: 1, taskUnlock: null },
      { trader: PRAPOR, priceRUB: 2, currency: "RUB", minTraderLevel: 1, taskUnlock: null },
    ];
    // A preset whose base is not an id cannot sell anything the snapshot holds.
    items.oddPreset = { id: "oddPreset", properties: { propertiesType: "ItemPropertiesPreset" } };
    expect(() => buildBuilderSnapshot(input, "upstream")).not.toThrow();
  });

  it("fails on a bad trader, task or barter, collecting all of them", async () => {
    const input = await docs();
    (input.traders as Record<string, unknown>).broken = null;
    const tasks = input.tasks.tasks as Mutable;
    tasks.lost = { id: "lost", name: "Lost", normalizedName: "lost", trader: "nobody" };
    tasks.nullTask = null as unknown as Record<string, unknown>;
    const [firstTask] = Object.keys(tasks);
    delete tasks[firstTask!]!.name;
    input.barters.push({ id: "bad-barter" });
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems).toEqual(
      expect.arrayContaining([
        "traders/broken: (record): Invalid input: expected object, received null",
        "tasks/lost: trader nobody is not in the traders document",
        "tasks/nullTask: trader undefined is not in the traders document",
        `tasks/${firstTask}: name: Invalid input: expected string, received undefined`,
      ]),
    );
    expect(problems.some((p) => p.startsWith("barters["))).toBe(true);
    expect(problems).toHaveLength(5);
  });

  it("fails on a cash offer it cannot gate, name or price", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    const seller = cashSeller(input);
    const offers = items[seller]!.buyFromTrader as Record<string, unknown>[];
    const [first] = offers;
    offers.push(
      { ...first, trader: "nobody" },
      { ...first, taskUnlock: "no-such-task", priceRUB: 1 },
      { ...first, minTraderLevel: "2", priceRUB: 2 },
      { ...first, priceRUB: "cheap", currency: 5 },
      null as unknown as Record<string, unknown>,
      { ...first, taskUnlock: 7, priceRUB: 3 },
    );
    const at = `items/${seller}: buyFromTrader`;
    const n = offers.length;
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      `${at}[${n - 6}]: trader nobody is not in the traders document`,
      `${at}[${n - 5}]: taskUnlock no-such-task is not in the tasks document`,
      `${at}[${n - 4}]: minTraderLevel is not a number`,
      `${at}[${n - 3}]: currency is not a string`,
      `${at}[${n - 3}]: priceRUB is not a number`,
      `${at}[${n - 2}] is not an object`,
      `${at}[${n - 1}]: taskUnlock is not a string`,
    ]);
  });

  it("fails on a buyFromTrader that is not a list", async () => {
    const input = await docs();
    const seller = cashSeller(input);
    (input.items.items as Mutable)[seller]!.buyFromTrader = { oops: true };
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      `items/${seller}: buyFromTrader is not an array`,
    ]);
  });

  it("fails on a barter whose trader or quest gate does not resolve", async () => {
    const input = await docs();
    const barter = barterRewardingAPart(input);
    const copy = { ...barter, id: "copy", trader: "nobody" };
    const gated = { ...barter, id: "gated", taskUnlock: "no-such-task" };
    input.barters.push(copy, gated);
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      "barters/copy: trader nobody is not in the traders document",
      "barters/gated: taskUnlock no-such-task is not in the tasks document",
    ]);
  });

  it("fails on a barter input that is missing or unnamed", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    const barter = barterRewardingAPart(input);
    barter.requiredItems.push({ item: "gone", count: 1, attributes: {} });
    delete items[SCREW_NUTS]!.name;
    barter.requiredItems.push({ item: SCREW_NUTS, count: 1, attributes: {} });
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual(
      expect.arrayContaining([
        `barters/${barter.id}: required item gone is not in the items document`,
        `barters/${barter.id}: required item ${SCREW_NUTS} has no name`,
      ]),
    );
  });

  it("fails on a part blocking a slot no item has", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    (items[BARREL_10_3]!.conflictingSlotIds as string[]).push("no-such-slot");
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      `items/${BARREL_10_3}: conflictingSlotIds names slot no-such-slot, which no item has`,
    ]);
  });

  it("fails on a weapon or part without an `updated` timestamp", async () => {
    const input = await docs();
    delete (input.items.items as Mutable)[BARREL_10_3]!.updated;
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      `items/${BARREL_10_3}: no valid \`updated\` timestamp`,
    ]);
  });

  it("fails on names that are still translation keys", async () => {
    // What a release built while `items_en` failed would see: the merge left every key.
    const input = await docs();
    const items = input.items.items as Mutable;
    items[M4A1]!.name = `${M4A1} Name`;
    items[BARREL_10_3]!.shortName = `${BARREL_10_3} ShortName`;
    items[SCREW_NUTS]!.name = `${SCREW_NUTS} Name`;
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      `items/${M4A1}: name is still its translation key; the _en document did not apply`,
      `items/${BARREL_10_3}: shortName is still its translation key; the _en document did not apply`,
      `items/${SCREW_NUTS}: name is still its translation key; the _en document did not apply`,
    ]);
  });

  it("fails on the untranslated capture", async () => {
    const raw = structuredClone(itemsCapture.document) as unknown as ItemsDocument;
    const input = { ...(await docs()), items: raw.data as unknown as ItemsDocument };
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems.length).toBeGreaterThan(0);
    for (const p of problems) expect(p).toMatch(/is still its translation key/);
  });

  it("fails when a weapon slot reaches something that is not a part", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    const slots = (items[M4A1]!.properties as { slots: { filters: { allowedItems: string[] } }[] })
      .slots;
    slots[0]!.filters.allowedItems.push(GRENADE);
    delete items[GRENADE]!.properties;
    items[GRENADE]!.properties = null;
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems).toEqual([
      `items/${GRENADE} (undefined): allowed in slot mod_pistol_grip of ${M4A1} but is not a part`,
    ]);
  });

  it("fails when no item carries an `updated` timestamp", async () => {
    const input = await docs();
    for (const item of Object.values(input.items.items as Mutable)) delete item.updated;
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems).toContain("items: no item carries an `updated` timestamp");
    expect(problems.filter((p) => p.endsWith("no valid `updated` timestamp")).length).toBe(
      problems.length - 1,
    );
  });

  it("fails on two copies of one trader offer that disagree on price", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    const { snapshot } = buildBuilderSnapshot(await docs(), "fixtures");
    const sellerId = snapshot.parts.find((p) =>
      snapshot.offers[p.id]!.some((o) => o.kind === "cash" && o.preset === undefined),
    )!.id;
    const seller = items[sellerId]!;
    const offers = seller.buyFromTrader as Record<string, unknown>[];
    offers.push({ ...offers[0], priceRUB: Number(offers[0]!.priceRUB) + 1 });
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^prices: trader offers under key .+ disagree on price$/);
  });

  it("says how many problems there were", () => {
    expect(new SnapshotDriftError(["a"]).message).toMatch(/\(1 problem\):\n {2}- a$/);
    expect(new SnapshotDriftError(["a", "b"]).message).toMatch(/\(2 problems\)/);
  });
});
