import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";

const weaponPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesWeapon"),
  ergonomics: z.number(),
  recoilVertical: z.number(),
  recoilHorizontal: z.number(),
  caliber: z.string(),
  fireRate: z.number(),
});

const weaponItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  properties: weaponPropertiesSchema,
});

export const weaponSchema = z.object({
  item: weaponItemSchema,
});

export type Weapon = z.infer<typeof weaponItemSchema>;

/**
 * Fetch a single weapon by its tarkov-api id, validated against {@link weaponSchema}.
 */
export async function fetchWeapon(client: TarkovJsonClient, id: string): Promise<Weapon> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  // The document is keyed by id, so this indexes rather than scanning 5000+ items.
  return weaponSchema.parse({ item: doc.items[id] ?? null }).item;
}
