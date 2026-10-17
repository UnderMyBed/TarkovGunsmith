import { z } from "zod";

export const traderListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
});

export const tradersSchema = z.object({
  traders: z.array(traderListItemSchema),
});

export type TraderListItem = z.infer<typeof traderListItemSchema>;

/** The 7 canonical profile-gating traders (excludes Fence, Ref). */
const PROFILE_TRADERS = new Set([
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
]);

/** The traders document: `data` is the trader map directly, with no wrapper key. */
export type TradersDocument = Record<string, unknown>;

/** Whether a trader is one of the 7 whose loyalty level the profile records. */
export function isProfileTrader(trader: { normalizedName: string }): boolean {
  return PROFILE_TRADERS.has(trader.normalizedName);
}
