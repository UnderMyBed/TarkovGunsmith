import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";

const ammoPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesAmmo"),
  caliber: z.string(),
  penetrationPower: z.number(),
  damage: z.number(),
  armorDamage: z.number(),
  projectileCount: z.number(),
});

const ammoItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  properties: ammoPropertiesSchema,
});

export const ammoListSchema = z.object({
  items: z.array(ammoItemSchema),
});

export type AmmoListItem = z.infer<typeof ammoItemSchema>;

/**
 * Fetch the full list of ammo items.
 *
 * The upstream document holds every item type in one map keyed by id, so this selects by
 * `propertiesType` and `safeParse`s each candidate, dropping the ones that do not match —
 * grenades, mods, armor and the rest. A single unrelated item shape never fails the call.
 *
 * Logs a `console.debug` line with the filtered count, so an upstream change (a new
 * `ItemPropertiesX` variant we should be mapping) is discoverable in the browser console.
 */
export async function fetchAmmoList(client: TarkovJsonClient): Promise<AmmoListItem[]> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const all = Object.values(doc.items);
  const ammoItems: AmmoListItem[] = [];
  for (const item of all) {
    const result = ammoItemSchema.safeParse(item);
    if (result.success) ammoItems.push(result.data);
  }
  if (ammoItems.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchAmmoList] filtered ${all.length - ammoItems.length} non-ammo items (kept ${ammoItems.length}/${all.length})`,
    );
  }
  return ammoItems;
}
