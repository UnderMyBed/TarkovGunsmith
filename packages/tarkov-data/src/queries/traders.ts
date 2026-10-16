import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";

const traderListItemSchema = z.object({
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

/**
 * Every trader in the document — the 7 profile traders plus Ref, Fence, Lightkeeper and any
 * vendor added later.
 *
 * Offer resolution reads this rather than {@link fetchTraders}: an offer from a trader the
 * profile cannot gate (Ref's GP-coin barters) still has to be resolvable by name, so
 * availability can report it as `untracked-trader` instead of dropping it unseen.
 */
export async function fetchTraderDirectory(client: TarkovJsonClient): Promise<TraderListItem[]> {
  const doc = await client.fetchResource<TradersDocument>("traders");
  const out: TraderListItem[] = [];
  for (const raw of Object.values(doc)) {
    const parsed = traderListItemSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Fetch the list of traders, filtered to the 7 that have loyalty-level gating relevant to
 * builds (excludes Fence, Ref, and any future non-LL-gated vendors).
 */
export async function fetchTraders(client: TarkovJsonClient): Promise<TraderListItem[]> {
  const all = await fetchTraderDirectory(client);
  return all.filter((t) => PROFILE_TRADERS.has(t.normalizedName));
}
