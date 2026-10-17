import { describe, expect, it } from "vitest";
import { fixtureClient } from "../__fixtures__/client.js";
import itemsCapture from "../__fixtures__/items-sample.json" with { type: "json" };
import { fixtureOfferResolver } from "../__test-utils__/fixture-snapshot.js";
import {
  buildBuilderSnapshot,
  fetchSnapshotDocuments,
  SnapshotDriftError,
  type SnapshotDocuments,
} from "./generate.js";
import { snapshotPartCatalog, snapshotWeaponList } from "./views.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const SP81 = "620109578d82e67e7911abf2";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const GRENADE = "5448be9a4bdc2dfd2f8b456a";
const SCREW_NUTS = "57347c77245977448d35f6e2"; // the PM preset barter's input

const docs = (): Promise<SnapshotDocuments> => fetchSnapshotDocuments(fixtureClient());

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

  it("prices to exactly what the resolver gives from the documents", async () => {
    // The split into unpriced offers plus a price table must lose nothing.
    const input = await docs();
    const { snapshot, prices } = buildBuilderSnapshot(input, "fixtures");
    const resolve = await fixtureOfferResolver();
    for (const item of [
      ...snapshotWeaponList(snapshot, prices.prices),
      ...snapshotPartCatalog(snapshot, prices.prices),
    ]) {
      expect(item.buyFor, item.id).toEqual(resolve(input.items.items[item.id]));
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

  it("skips barter inputs it cannot find, and names an unnamed one by id", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    delete items[SCREW_NUTS];
    const barter = (input.barters as { requiredItems: { item: string }[] }[])[1]!;
    const [first] = barter.requiredItems;
    delete items[first!.item]!.name;
    // A barter whose input is a part: the part's name already lives in the catalog.
    barter.requiredItems.push({ ...first!, item: BARREL_10_3 });
    const { snapshot } = buildBuilderSnapshot(input, "fixtures");
    expect(snapshot.ingredientNames).not.toHaveProperty(SCREW_NUTS);
    expect(snapshot.ingredientNames[first!.item]).toBe(first!.item);
    expect(snapshot.ingredientNames).not.toHaveProperty(BARREL_10_3);
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

  it("fails on a part or weapon that no longer matches its schema, naming it", async () => {
    const input = await docs();
    const items = input.items.items as Mutable;
    delete items[BARREL_10_3]!.conflictingSlotIds;
    (items[M4A1]!.properties as Record<string, unknown>).fireRate = "fast";
    const problems = driftOf(() => buildBuilderSnapshot(input, "upstream"));
    expect(problems).toEqual([
      `items/${M4A1} (ItemPropertiesWeapon): properties.fireRate: Invalid input: expected number, received string`,
      `items/${BARREL_10_3} (ItemPropertiesBarrel): conflictingSlotIds: Invalid input: expected array, received undefined`,
    ]);
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
    expect(driftOf(() => buildBuilderSnapshot(input, "upstream"))).toEqual([
      "items: no item carries an `updated` timestamp",
    ]);
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
