import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";
import { resolveBuyFor } from "./shared/buy-for.js";
import { fetchTraders } from "./traders.js";
import { fetchTasks } from "./tasks.js";
import { buyForEntrySchema } from "./shared/buy-for.js";

const modPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesWeaponMod"),
  ergonomics: z.number(),
  recoilModifier: z.number(),
  accuracyModifier: z.number(),
});

const modListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  minLevelForFlea: z.number().int().nullable(),
  properties: modPropertiesSchema,
  buyFor: z.array(buyForEntrySchema).nullable(),
});

export const modListSchema = z.object({
  items: z.array(modListItemSchema),
});

export type ModListItem = z.infer<typeof modListItemSchema>;
// Re-exported for backward compat with existing consumers.
export type { BuyForEntry as ModListBuyFor, Vendor as ModListVendor } from "./shared/buy-for.js";

/**
 * Fetch the list of weapon mods that affect ergo/recoil/accuracy
 * (`ItemPropertiesWeaponMod` only — magazines, scopes, barrels, night-vision
 * are filtered out for v0.12.0; they ship in a follow-up plan that wires
 * slot-based compatibility).
 */
export async function fetchModList(client: TarkovJsonClient): Promise<ModListItem[]> {
  // All three come from the client cache, so this is one network round trip in practice.
  const [doc, traders, tasks] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchTraders(client),
    fetchTasks(client),
  ]);

  const all = Object.values(doc.items);
  const out: ModListItem[] = [];
  for (const item of all) {
    // `buyFor` is the only acquisition path this query resolves. Crafting and barter
    // sourcing live in the upstream `/crafts` and `/barters` resources, which nothing in
    // this package fetches — see docs/adr/0002-json-api-migration.md
    // §"deferred". A mod item therefore carries no craft/barter fields at all rather than
    // always-empty ones, so a consumer can't derive a "this is craftable" signal that the
    // data cannot support.
    const candidate = {
      ...(item as object),
      buyFor: resolveBuyFor(item, traders, tasks),
    };
    const parsed = modListItemSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  if (out.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchModList] filtered ${all.length - out.length} non-mod items (kept ${out.length}/${all.length})`,
    );
  }
  return out;
}
