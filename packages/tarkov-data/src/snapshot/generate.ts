import type { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { BartersDocument, ItemsDocument, TasksDocument } from "../queries/documents.js";
import { barterSchema, type Barter } from "../queries/barters.js";
import { PART_TYPES, partRecord, snapshotPartSchema } from "../queries/parts.js";
import { buildSlotGraph, type SlotOwner } from "../queries/slot-graph.js";
import { taskListItemSchema, type TaskListItem } from "../queries/tasks.js";
import {
  traderListItemSchema,
  type TraderListItem,
  type TradersDocument,
} from "../queries/traders.js";
import {
  defaultAmmoSchema,
  isBuildableWeapon,
  weaponRecordSchema,
  type SnapshotDefaultAmmo,
} from "../queries/weaponList.js";
import { selectWeaponPresets } from "../queries/presets.js";
import {
  createOfferCollector,
  offerPriceIds,
  type UnpricedOffer,
} from "../queries/shared/buy-for.js";
import { extractPrices, newestUpdated } from "../prices/table.js";
import {
  BUILDER_SNAPSHOT_SCHEMA,
  type BuilderPrices,
  type BuilderSnapshot,
  type SnapshotPart,
  type SnapshotPreset,
  type SnapshotSource,
  type SnapshotWeapon,
} from "./types.js";
import { UPSTREAM_FLOORS } from "./limits.js";

/** The translated upstream documents a snapshot is built from. */
export interface SnapshotDocuments {
  readonly items: ItemsDocument;
  readonly tasks: TasksDocument;
  readonly traders: TradersDocument;
  readonly barters: BartersDocument;
}

/**
 * Upstream no longer matches what the Builder reads. `problems` lists every record that
 * failed, one line each, so a single failed deploy shows the whole extent of the drift.
 */
export class SnapshotDriftError extends Error {
  override name = "SnapshotDriftError";
  constructor(readonly problems: readonly string[]) {
    // A renamed field upstream fails thousands of records alike; the first lines name it.
    const shown = problems.slice(0, MESSAGE_PROBLEMS);
    const more = problems.length - shown.length;
    super(
      `upstream data no longer matches the Builder's schemas (${problems.length} problem${
        problems.length === 1 ? "" : "s"
      }):\n  - ${shown.join("\n  - ")}${more > 0 ? `\n  … and ${more} more` : ""}`,
    );
  }
}

/** How many problems a {@link SnapshotDriftError} message lists; `problems` holds all. */
const MESSAGE_PROBLEMS = 50;

/** Fetch the four documents a snapshot needs, translations merged. */
export async function fetchSnapshotDocuments(client: TarkovJsonClient): Promise<SnapshotDocuments> {
  const [items, tasks, traders, barters] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    client.fetchResource<TasksDocument>("tasks"),
    client.fetchResource<TradersDocument>("traders"),
    client.fetchResource<BartersDocument>("barters"),
  ]);
  return { items, tasks, traders, barters };
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(record)"}: ${issue.message}`,
    )
    .join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function propertiesTypeOf(item: unknown): string | undefined {
  const type = (item as { properties?: { propertiesType?: unknown } | null } | null)?.properties
    ?.propertiesType;
  return typeof type === "string" ? type : undefined;
}

/** Code-unit order, independent of the build machine's locale. */
const compareStrings = (a: string, b: string): number => Number(a > b) - Number(a < b);

function sortedRecord<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  return Object.fromEntries([...entries].sort(([a], [b]) => compareStrings(a, b)));
}

const byId = (a: { id: string }, b: { id: string }) => compareStrings(a.id, b.id);

/** What upstream leaves in a text field whose translation did not apply. */
const translationKey = (id: string, field: "Name" | "ShortName" | "Nickname" | "name"): string =>
  `${id} ${field}`;

const untranslated = (at: string, field: string): string =>
  `${at}: ${field} is still its translation key; the _en document did not apply`;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * A weapon's `defaultAmmo`, resolved to what the Builder shows: its short name and speed.
 * `null` when upstream publishes the item with no `properties` at all (the RShG-2's rocket),
 * since there is then no speed to show. Anything else that is not a cartridge with a
 * positive `initialSpeed` is drift, returned as the problem to report.
 */
function resolveDefaultAmmo(
  items: Readonly<Record<string, unknown>>,
  ammoId: string,
): SnapshotDefaultAmmo | null | string {
  const raw = items[ammoId] as
    | {
        shortName?: unknown;
        types?: unknown;
        properties?: { initialSpeed?: unknown } | null;
      }
    | undefined;
  if (raw === undefined) return `defaultAmmo ${ammoId} is not in the items document`;
  // Ammo either way: typed as ammo with no properties (the RShG-2's rocket), which has no
  // speed to show, or an ItemPropertiesAmmo record. Anything else is drift.
  if (raw.properties === null) {
    const isAmmo = Array.isArray(raw.types) && raw.types.includes("ammo");
    return isAmmo ? null : `defaultAmmo ${ammoId} has no properties and is not ammo`;
  }
  if (propertiesTypeOf(raw) !== "ItemPropertiesAmmo") {
    return `defaultAmmo ${ammoId} is ${String(propertiesTypeOf(raw))}, not ammo`;
  }
  const parsed = defaultAmmoSchema.safeParse({
    id: ammoId,
    shortName: raw.shortName,
    initialSpeed: raw.properties?.initialSpeed,
  });
  if (!parsed.success) return `defaultAmmo ${ammoId}: ${describeIssues(parsed.error)}`;
  if (parsed.data.shortName === translationKey(ammoId, "ShortName")) {
    return untranslated(`defaultAmmo ${ammoId}`, "shortName");
  }
  return parsed.data;
}

/** The counts an upstream snapshot is held to, by {@link UPSTREAM_FLOORS} key. */
export type FloorCounts = Readonly<Record<keyof typeof UPSTREAM_FLOORS, number>>;

/** One line per count below its floor. */
export function floorProblems(
  counts: FloorCounts,
  floors: FloorCounts = UPSTREAM_FLOORS,
): string[] {
  return (Object.keys(floors) as (keyof FloorCounts)[])
    .filter((what) => counts[what] < floors[what])
    .map(
      (what) =>
        `floors: ${what} ${counts[what]}, below the floor of ${floors[what]}; rows went unrecognised`,
    );
}

/**
 * Problems with one reached owner's raw slots. The slot graph reads slots leniently — a slot
 * without a `nameId` or `allowedItems` simply offers nothing — so a renamed slot field would
 * otherwise ship a Builder with empty slots, or with slot paths no saved build matches.
 */
function slotShapeProblems(ownerId: string, raw: unknown): string[] {
  // A reached owner parsed as a weapon or part, so it has `properties`.
  const slots = (raw as { properties: { slots?: unknown } }).properties.slots;
  if (slots === undefined || slots === null) return [];
  if (!Array.isArray(slots)) return [`items/${ownerId}: properties.slots is not an array`];
  const problems: string[] = [];
  for (const [index, slot] of (slots as unknown[]).entries()) {
    const at = `items/${ownerId}: properties.slots[${index}]`;
    if (!isRecord(slot)) {
      problems.push(`${at} is not an object`);
      continue;
    }
    for (const field of ["id", "nameId", "name"] as const) {
      if (!isNonEmptyString(slot[field])) problems.push(`${at}.${field} is not a non-empty string`);
    }
    const filters = slot.filters as { allowedItems?: unknown } | null | undefined;
    if (!Array.isArray(filters?.allowedItems)) {
      problems.push(`${at}.filters.allowedItems is not an array`);
    }
  }
  return problems;
}

/**
 * Build the Builder snapshot, and the release-time prices beside it, from the upstream
 * documents.
 *
 * Strict for everything the snapshot holds or derives from: every trader and task, and their
 * names; every buildable weapon; every part a weapon's slots reach, its `conflictingSlotIds`
 * and `updated`; the slots of every reached item (`id`, `nameId`, `name`,
 * `filters.allowedItems`); every preset's `baseItem`, and the `normalizedName` of each preset
 * of a snapshot item; every buildable weapon's presets, which must place into the slot graph
 * with exactly one default per weapon; every offer on those (cash, preset and barter: trader, quest gate,
 * loyalty level, price fields); every barter rewarding one of them, or a preset of one, and
 * each of its ingredients; and two copies of one seller's trader offer that disagree on
 * price. Names that are still translation keys are drift too: the translation document did
 * not apply. Built from `upstream`, the snapshot must also meet {@link UPSTREAM_FLOORS}: a
 * renamed type or link makes rows vanish rather than fail to parse. Every problem is collected
 * and thrown together as a {@link SnapshotDriftError}, so a deploy fails rather than ship a
 * Builder with options missing or mislabelled.
 *
 * Records the Builder never reads are not checked, so they cannot block a release: weapons
 * flagged `specialSlot`, part-typed items no weapon reaches and their slots, barters
 * rewarding anything else, ingredients' own trader offers, and items of other types.
 *
 * Output is deterministic: arrays and maps are sorted by id, so the same documents give a
 * byte-identical file.
 */
export function buildBuilderSnapshot(
  docs: SnapshotDocuments,
  source: SnapshotSource,
): { snapshot: BuilderSnapshot; prices: BuilderPrices } {
  const problems = new Set<string>();
  const fail = (line: string): void => void problems.add(line);
  const throwIfProblems = (): void => {
    if (problems.size > 0) throw new SnapshotDriftError([...problems].sort());
  };

  if (!isRecord(docs.traders)) fail("traders: expected an id-keyed object");
  if (!isRecord(docs.tasks) || !isRecord(docs.tasks.tasks)) fail("tasks: expected `tasks` map");
  if (!Array.isArray(docs.barters)) fail("barters: expected an array");
  if (!isRecord(docs.items) || !isRecord(docs.items.items)) fail("items: expected `items` map");
  throwIfProblems();
  const items = docs.items.items;

  const traders: TraderListItem[] = [];
  for (const [key, raw] of Object.entries(docs.traders)) {
    const parsed = traderListItemSchema.safeParse(raw);
    if (!parsed.success) {
      fail(`traders/${key}: ${describeIssues(parsed.error)}`);
      continue;
    }
    traders.push(parsed.data);
    if (parsed.data.name === translationKey(key, "Nickname"))
      fail(untranslated(`traders/${key}`, "name"));
  }
  const traderNameById = new Map(traders.map((t) => [t.id, t.normalizedName]));

  const tasks: TaskListItem[] = [];
  for (const [key, raw] of Object.entries(docs.tasks.tasks)) {
    const traderId = (raw as { trader?: unknown } | null)?.trader;
    const normalizedName = typeof traderId === "string" ? traderNameById.get(traderId) : undefined;
    if (normalizedName === undefined) {
      fail(`tasks/${key}: trader ${String(traderId)} is not in the traders document`);
      continue;
    }
    const parsed = taskListItemSchema.safeParse({ ...(raw as object), trader: { normalizedName } });
    if (!parsed.success) {
      fail(`tasks/${key}: ${describeIssues(parsed.error)}`);
      continue;
    }
    tasks.push(parsed.data);
    if (parsed.data.name === translationKey(key, "name"))
      fail(untranslated(`tasks/${key}`, "name"));
  }

  const newest = newestUpdated(items);
  const updatedOf = new Map<string, number>();
  const weapons: SnapshotWeapon[] = [];
  const allParts = new Map<string, SnapshotPart>();
  // Part-typed items that fail their schema. Drift only if a weapon reaches them.
  const brokenParts = new Map<string, string>();
  const presetBases = new Map<string, string>();
  for (const [key, raw] of Object.entries(items)) {
    const updated = Date.parse(String((raw as { updated?: unknown } | null)?.updated));
    if (!Number.isNaN(updated)) {
      updatedOf.set(key, updated);
    }

    const type = propertiesTypeOf(raw);
    if (type === "ItemPropertiesWeapon") {
      const types = (raw as { types?: unknown }).types;
      if (Array.isArray(types) && !isBuildableWeapon({ types: types as string[] })) continue;
      const parsed = weaponRecordSchema.safeParse(raw);
      if (!parsed.success) {
        fail(`items/${key} (${type}): ${describeIssues(parsed.error)}`);
        continue;
      }
      const { defaultAmmo: ammoId, ...properties } = parsed.data.properties;
      const ammo = resolveDefaultAmmo(items, ammoId);
      if (typeof ammo === "string") fail(`items/${key} (${type}): ${ammo}`);
      else weapons.push({ ...parsed.data, properties, defaultAmmo: ammo });
    } else if (type !== undefined && PART_TYPES.has(type)) {
      const parsed = snapshotPartSchema.safeParse(partRecord(raw));
      if (parsed.success) allParts.set(parsed.data.id, parsed.data);
      else brokenParts.set(key, `items/${key} (${type}): ${describeIssues(parsed.error)}`);
    } else if (type === "ItemPropertiesPreset") {
      // A preset sells its base item: without a base, nothing tells whether the snapshot needs
      // its offers, so it is drift whatever it is a preset of.
      const base = (raw as { properties: { baseItem?: unknown } }).properties.baseItem;
      if (typeof base === "string") presetBases.set(key, base);
      else fail(`items/${key} (${type}): properties.baseItem is not a string`);
    }
  }
  if (newest === null) fail("items: no item carries an `updated` timestamp");

  // Walk the slot graph from the buildable weapons. Everything a weapon can reach must be a
  // part, or it would be an option the Builder offers but cannot price, gate or add up.
  const graph = buildSlotGraph(docs.items);
  const weaponIds = new Set(weapons.map((w) => w.id));
  const reached = new Set<string>();
  const stack = [...weaponIds];
  for (let owner = stack.pop(); owner !== undefined; owner = stack.pop()) {
    if (reached.has(owner)) continue;
    reached.add(owner);
    for (const problem of slotShapeProblems(owner, items[owner])) fail(problem);
    for (const slot of graph.owners[owner]?.slots ?? []) {
      for (const id of slot.allowedItemIds) {
        if (allParts.has(id)) {
          stack.push(id);
          continue;
        }
        fail(
          brokenParts.get(id) ??
            `items/${id} (${String(propertiesTypeOf(items[id]))}): allowed in slot ` +
              `${slot.nameId} of ${owner} but is not a part`,
        );
      }
    }
  }

  const parts = [...allParts.values()].filter((p) => reached.has(p.id)).sort(byId);
  const partIds = new Set(parts.map((p) => p.id));
  const slotIds = new Set(
    Object.values(graph.owners).flatMap((owner) => owner.slots.map((slot) => slot.id)),
  );
  for (const item of [...weapons, ...parts]) {
    if (!updatedOf.has(item.id)) fail(`items/${item.id}: no valid \`updated\` timestamp`);
    if (item.name === translationKey(item.id, "Name"))
      fail(untranslated(`items/${item.id}`, "name"));
    if (item.shortName === translationKey(item.id, "ShortName")) {
      fail(untranslated(`items/${item.id}`, "shortName"));
    }
  }
  // A preset of a snapshot item is how traders sell it; the collector tags each such offer
  // with the preset's normalizedName, and skips a preset without one.
  for (const [presetId, base] of presetBases) {
    if (!weaponIds.has(base) && !partIds.has(base)) continue;
    if (!isNonEmptyString((items[presetId] as { normalizedName?: unknown }).normalizedName)) {
      fail(`items/${presetId} (ItemPropertiesPreset): normalizedName is not a non-empty string`);
    }
  }
  for (const part of parts) {
    for (const slotId of part.conflictingSlotIds) {
      if (!slotIds.has(slotId)) {
        fail(`items/${part.id}: conflictingSlotIds names slot ${slotId}, which no item has`);
      }
    }
  }
  const slots = sortedRecord<SlotOwner>(
    [...reached].flatMap((id) => {
      const owner = graph.owners[id];
      return owner === undefined ? [] : [[id, owner] as const];
    }),
  );

  // Only barters rewarding a weapon or part — or a preset of one — feed the snapshot.
  const rewardsSnapshotItem = (id: unknown): boolean => {
    if (typeof id !== "string") return true; // cannot tell: treat as in scope, and report it
    if (weaponIds.has(id) || partIds.has(id)) return true;
    const base = presetBases.get(id);
    return base !== undefined && (weaponIds.has(base) || partIds.has(base));
  };
  const barters: Barter[] = [];
  for (const [index, raw] of docs.barters.entries()) {
    const offered = (raw as { offeredItem?: { item?: unknown } } | null)?.offeredItem?.item;
    if (!rewardsSnapshotItem(offered)) continue;
    const parsed = barterSchema.safeParse(raw);
    if (parsed.success) barters.push(parsed.data);
    else fail(`barters[${index}]: ${describeIssues(parsed.error)}`);
  }

  const collect = createOfferCollector({ items, traders, tasks, barters }, fail);
  const offers = new Map<string, UnpricedOffer[]>();
  for (const { id } of [...weapons, ...parts]) offers.set(id, collect(items[id]));

  // Every buildable weapon's presets, placed into the same slot graph. A preset that fails
  // its schema or cannot be placed, and a weapon without exactly one default, is drift: a
  // weapon silently left without its presets would start new builds empty.
  const placed = selectWeaponPresets(docs.items, graph);
  for (const { id, reason, detail } of placed.failures) fail(`presets/${id}: ${reason}: ${detail}`);
  const presets = sortedRecord(
    Object.entries(placed.byWeapon)
      .filter(([weaponId]) => weaponIds.has(weaponId))
      .map(([weaponId, list]) => [
        weaponId,
        list.map((preset): SnapshotPreset => {
          // The picker shows these names, so an untranslated one is drift like any other.
          if (preset.name === translationKey(preset.id, "Name"))
            fail(untranslated(`items/${preset.id}`, "name"));
          if (preset.shortName === translationKey(preset.id, "ShortName"))
            fail(untranslated(`items/${preset.id}`, "shortName"));
          // The preset's own flea listing; its trader offers are already the weapon's.
          const flea = collect(items[preset.id]).find((offer) => offer.kind === "flea");
          return {
            ...preset,
            flea: flea === undefined ? null : { minPlayerLevel: flea.vendor.minPlayerLevel },
          };
        }),
      ]),
  );

  const priceIds = new Set<string>();
  for (const list of Object.values(presets)) {
    for (const preset of list) if (preset.flea !== null) priceIds.add(preset.id);
  }
  // Ids that sell something: the snapshot's items and the presets they are sold as. Only
  // their trader offers are priced; an ingredient is valued at its flea price alone.
  const sellerIds = new Set<string>();
  const ingredientNames = new Map<string, string>();
  for (const [id, list] of offers) {
    for (const priceId of offerPriceIds(id, list)) priceIds.add(priceId);
    sellerIds.add(id);
    for (const offer of list)
      if (offer.kind !== "flea" && offer.preset) sellerIds.add(offer.preset.id);
    for (const offer of list) {
      if (offer.kind !== "barter") continue;
      for (const { itemId } of offer.vendor.requiredItems) {
        // A weapon or part in the snapshot is already named there. Anything else, including a
        // part-typed item no weapon reaches, is named here or its barter could not be priced.
        if (weaponIds.has(itemId) || partIds.has(itemId)) continue;
        const raw = items[itemId];
        const at = `barters/${offer.vendor.barterId}`;
        if (!isRecord(raw)) {
          fail(`${at}: required item ${itemId} is not in the items document`);
          continue;
        }
        if (typeof raw.name !== "string") {
          fail(`${at}: required item ${itemId} has no name`);
          continue;
        }
        if (raw.name === translationKey(itemId, "Name"))
          fail(untranslated(`items/${itemId}`, "name"));
        ingredientNames.set(itemId, raw.name);
      }
    }
  }

  const { table, conflicts } = extractPrices((id) => items[id], [...priceIds].sort(), sellerIds);
  for (const key of conflicts) fail(`prices: trader offers under key ${key} disagree on price`);

  if (source === "upstream") {
    const all = [...offers.values()].flat();
    const counts = {
      weapons: weapons.length,
      parts: parts.length,
      presetOffers: all.filter((o) => o.kind !== "flea" && o.preset !== undefined).length,
      barterOffers: all.filter((o) => o.kind === "barter").length,
      presets: Object.values(presets).flat().length,
      presetWeapons: Object.keys(presets).length,
    };
    for (const problem of floorProblems(counts)) fail(problem);
  }
  throwIfProblems();

  // `throwIfProblems` above has already failed the build when no item carries a timestamp.
  const dataAsOf = newest!;
  const snapshot: BuilderSnapshot = {
    schema: BUILDER_SNAPSHOT_SCHEMA,
    source,
    dataAsOf,
    weapons: weapons.sort(byId),
    parts,
    slots,
    offers: sortedRecord(offers),
    presets,
    ingredientNames: sortedRecord(ingredientNames),
    traders: traders.sort(byId),
    // Stable sort, so tasks sharing a normalizedName keep the document's order.
    tasks: tasks.sort((a, b) => compareStrings(a.normalizedName, b.normalizedName)),
  };
  const prices: BuilderPrices = {
    schema: BUILDER_SNAPSHOT_SCHEMA,
    source,
    dataAsOf,
    prices: {
      items: sortedRecord(Object.entries(table.items)),
      trader: sortedRecord(Object.entries(table.trader)),
    },
  };
  return { snapshot, prices };
}
