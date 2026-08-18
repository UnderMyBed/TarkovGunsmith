import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";
import { resolveBuyFor } from "./shared/buy-for.js";
import { fetchTraders } from "./traders.js";
import { fetchTasks } from "./tasks.js";
import { buyForEntrySchema } from "./shared/buy-for.js";

const weaponPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesWeapon"),
  caliber: z.string(),
  ergonomics: z.number(),
  recoilVertical: z.number(),
  recoilHorizontal: z.number(),
  fireRate: z.number(),
});

const weaponListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  properties: weaponPropertiesSchema,
  buyFor: z.array(buyForEntrySchema),
});

export const weaponListSchema = z.object({
  items: z.array(weaponListItemSchema),
});

export type WeaponListItem = z.infer<typeof weaponListItemSchema>;

/**
 * Fetch the full list of weapons (`items(type: gun)`). Same filter pattern as
 * fetchAmmoList — outer envelope strict, items safe-parsed and dropped if they
 * don't match the strict per-item schema.
 */
export async function fetchWeaponList(client: TarkovJsonClient): Promise<WeaponListItem[]> {
  const [doc, traders, tasks] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchTraders(client),
    fetchTasks(client),
  ]);

  const all = Object.values(doc.items);
  const out: WeaponListItem[] = [];
  for (const item of all) {
    const parsed = weaponListItemSchema.safeParse({
      ...(item as object),
      buyFor: resolveBuyFor(item, traders, tasks),
    });
    if (parsed.success) out.push(parsed.data);
  }
  if (out.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchWeaponList] filtered ${all.length - out.length} non-weapon items (kept ${out.length}/${all.length})`,
    );
  }
  return out;
}
