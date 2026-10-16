import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { BartersDocument, ItemsDocument } from "./documents.js";
import { createOfferResolver, type OfferResolver } from "./shared/buy-for.js";
import { fetchTraderDirectory } from "./traders.js";
import { fetchTasks } from "./tasks.js";

/**
 * One item line in a barter — what the trader wants, or what they hand over.
 *
 * Mirrors `json.tarkov.dev/regular/barters` `data[].requiredItems[]` / `.offeredItem`.
 * `count` is NOT an integer: Ref prices in GP coins and upstream sends fractions such as
 * `155.1`. `attributes` is `{}` except on dogtags, where it carries `{ minLevel }`.
 */
const barterItemSchema = z.object({
  item: z.string(),
  count: z.number(),
  attributes: z.record(z.string(), z.unknown()),
});

/**
 * One trader barter, as `json.tarkov.dev/regular/barters` sends it (`data` is an array).
 *
 * `trader` and `taskUnlock` are bare ids, joined to names by `createOfferResolver`.
 * `restockAmount` and `buyLimit` are present upstream and deliberately not read.
 */
export const barterSchema = z.object({
  id: z.string(),
  trader: z.string(),
  taskUnlock: z.string().nullable(),
  minTraderLevel: z.number().int(),
  requiredItems: z.array(barterItemSchema),
  offeredItem: barterItemSchema,
});

export type Barter = z.infer<typeof barterSchema>;
export type BarterItem = z.infer<typeof barterItemSchema>;

/**
 * Validate the barters document. Pure — no fetch — so a build-time snapshot can call it on a
 * document it already holds.
 *
 * A record that fails the schema is dropped and counted at `console.debug`, so one upstream
 * variant cannot take every barter with it. A document that is not an array throws.
 */
export function parseBarters(doc: BartersDocument): Barter[] {
  // A document that is not an array means upstream moved the whole resource. Reading that as
  // "no barters" would quietly turn every barter-only item unobtainable, so it throws.
  if (!Array.isArray(doc)) {
    throw new Error(`parseBarters: expected an array of barters, got ${typeof doc}`);
  }
  const raw: unknown[] = doc;
  const out: Barter[] = [];
  for (const record of raw) {
    const parsed = barterSchema.safeParse(record);
    if (parsed.success) out.push(parsed.data);
  }
  if (out.length < raw.length && typeof console !== "undefined") {
    console.debug(
      `[parseBarters] dropped ${raw.length - out.length} malformed barters (kept ${out.length}/${raw.length})`,
    );
  }
  return out;
}

/** Fetch and validate every trader barter. */
export async function fetchBarters(client: TarkovJsonClient): Promise<Barter[]> {
  return parseBarters(await client.fetchResource<BartersDocument>("barters"));
}

/**
 * Fetch everything offer resolution needs and build the resolver once.
 *
 * All five documents come from the client cache, so a second caller in the same session
 * costs nothing. The resolver itself is pure — see `createOfferResolver`.
 */
export async function fetchOfferResolver(client: TarkovJsonClient): Promise<OfferResolver> {
  const [doc, traders, tasks, barters] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchTraderDirectory(client),
    fetchTasks(client),
    fetchBarters(client),
  ]);
  return createOfferResolver({ items: doc.items, traders, tasks, barters });
}
