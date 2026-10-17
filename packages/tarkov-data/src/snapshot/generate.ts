import type { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { BartersDocument, ItemsDocument, TasksDocument } from "../queries/documents.js";
import { barterSchema, type Barter } from "../queries/barters.js";
import { PART_TYPES, snapshotPartSchema } from "../queries/parts.js";
import { buildSlotGraph, type SlotOwner } from "../queries/slot-graph.js";
import { taskListItemSchema, type TaskListItem } from "../queries/tasks.js";
import {
  traderListItemSchema,
  type TraderListItem,
  type TradersDocument,
} from "../queries/traders.js";
import { isBuildableWeapon, snapshotWeaponSchema } from "../queries/weaponList.js";
import {
  createOfferCollector,
  extractPrices,
  offerPriceIds,
  type UnpricedOffer,
} from "../queries/shared/buy-for.js";
import {
  BUILDER_SNAPSHOT_SCHEMA,
  type BuilderPrices,
  type BuilderSnapshot,
  type SnapshotPart,
  type SnapshotSource,
  type SnapshotWeapon,
} from "./types.js";

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
    super(
      `upstream data no longer matches the Builder's schemas (${problems.length} problem${
        problems.length === 1 ? "" : "s"
      }):\n  - ${problems.join("\n  - ")}`,
    );
  }
}

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

/**
 * Build the Builder snapshot, and the release-time prices beside it, from the upstream
 * documents.
 *
 * Strict by design. Records are picked by type — an item whose `properties.propertiesType` is
 * not a weapon or part type is simply not a candidate — but a candidate that fails its schema
 * is drift, as is a trader, task or barter that fails, a task whose trader does not resolve, a
 * weapon-reachable slot item that is not a part, and two copies of one trader offer that
 * disagree on price. Every problem is collected and thrown together as a
 * {@link SnapshotDriftError}: nothing is dropped and carried on past. A deploy must fail rather
 * than ship a Builder with options silently missing.
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
    if (parsed.success) traders.push(parsed.data);
    else fail(`traders/${key}: ${describeIssues(parsed.error)}`);
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
    if (parsed.success) tasks.push(parsed.data);
    else fail(`tasks/${key}: ${describeIssues(parsed.error)}`);
  }

  const barters: Barter[] = [];
  for (const [index, raw] of docs.barters.entries()) {
    const parsed = barterSchema.safeParse(raw);
    if (parsed.success) barters.push(parsed.data);
    else fail(`barters[${index}]: ${describeIssues(parsed.error)}`);
  }

  let newest = Number.NEGATIVE_INFINITY;
  const weapons: SnapshotWeapon[] = [];
  const allParts = new Map<string, SnapshotPart>();
  for (const [key, raw] of Object.entries(items)) {
    const updated = Date.parse(String((raw as { updated?: unknown } | null)?.updated));
    if (updated > newest) newest = updated;

    const type = propertiesTypeOf(raw);
    if (type === "ItemPropertiesWeapon") {
      const parsed = snapshotWeaponSchema.safeParse(raw);
      if (!parsed.success) fail(`items/${key} (${type}): ${describeIssues(parsed.error)}`);
      else if (isBuildableWeapon(parsed.data)) weapons.push(parsed.data);
    } else if (type !== undefined && PART_TYPES.has(type)) {
      const parsed = snapshotPartSchema.safeParse(raw);
      if (parsed.success) allParts.set(parsed.data.id, parsed.data);
      else fail(`items/${key} (${type}): ${describeIssues(parsed.error)}`);
    }
  }
  if (newest === Number.NEGATIVE_INFINITY) fail("items: no item carries an `updated` timestamp");
  throwIfProblems();

  // Walk the slot graph from the buildable weapons. Everything a weapon can reach must be a
  // part, or it would be an option the Builder offers but cannot price, gate or add up.
  const graph = buildSlotGraph(docs.items);
  const weaponIds = new Set(weapons.map((w) => w.id));
  const reached = new Set<string>();
  const stack = [...weaponIds];
  for (let owner = stack.pop(); owner !== undefined; owner = stack.pop()) {
    if (reached.has(owner)) continue;
    reached.add(owner);
    for (const slot of graph.owners[owner]?.slots ?? []) {
      for (const id of slot.allowedItemIds) {
        if (!allParts.has(id)) {
          fail(
            `items/${id} (${String(propertiesTypeOf(items[id]))}): allowed in slot ` +
              `${slot.nameId} of ${owner} but is not a part`,
          );
          continue;
        }
        stack.push(id);
      }
    }
  }
  throwIfProblems();

  const parts = [...allParts.values()].filter((p) => reached.has(p.id)).sort(byId);
  const slots = sortedRecord<SlotOwner>(
    [...reached].flatMap((id) => {
      const owner = graph.owners[id];
      return owner === undefined ? [] : [[id, owner] as const];
    }),
  );

  const collect = createOfferCollector({ items, traders, tasks, barters });
  const offers = new Map<string, UnpricedOffer[]>();
  for (const { id } of [...weapons, ...parts]) offers.set(id, collect(items[id]));

  const priceIds = new Set<string>();
  const ingredientNames = new Map<string, string>();
  for (const [id, list] of offers) {
    for (const priceId of offerPriceIds(id, list)) priceIds.add(priceId);
    for (const offer of list) {
      if (offer.kind !== "barter") continue;
      for (const { itemId } of offer.vendor.requiredItems) {
        if (weaponIds.has(itemId) || allParts.has(itemId)) continue;
        const raw = items[itemId];
        if (!isRecord(raw)) continue;
        ingredientNames.set(itemId, typeof raw.name === "string" ? raw.name : itemId);
      }
    }
  }

  const { table, conflicts } = extractPrices((id) => items[id], [...priceIds].sort());
  for (const key of conflicts) fail(`prices: trader offers under key ${key} disagree on price`);
  throwIfProblems();

  const dataAsOf = new Date(newest).toISOString();
  const snapshot: BuilderSnapshot = {
    schema: BUILDER_SNAPSHOT_SCHEMA,
    source,
    dataAsOf,
    weapons: weapons.sort(byId),
    parts,
    slots,
    offers: sortedRecord(offers),
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
