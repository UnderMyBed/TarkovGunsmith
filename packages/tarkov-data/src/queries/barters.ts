import { z } from "zod";

/**
 * One item line in a barter — what the trader wants, or what they hand over.
 *
 * Mirrors `json.tarkov.dev/regular/barters` `data[].requiredItems[]` / `.offeredItem`.
 * `count` is NOT an integer: Ref prices in GP coins and upstream sends fractions such as
 * `155.1`. `attributes` is `{}` except on dogtags, where it carries `{ minLevel }`.
 */
const barterItemSchema = z.object({
  item: z.string(),
  // Positive: barter cost is divided by the offered count.
  count: z.number().positive(),
  attributes: z.record(z.string(), z.unknown()),
});

/**
 * One trader barter, as `json.tarkov.dev/regular/barters` sends it (`data` is an array).
 *
 * `trader` and `taskUnlock` are bare ids, joined to names by `createOfferCollector`.
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
