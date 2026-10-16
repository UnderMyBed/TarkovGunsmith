import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";
import { buyForEntrySchema } from "./shared/buy-for.js";
import { fetchOfferResolver } from "./barters.js";

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
 * Whether an `ItemPropertiesWeapon` item belongs in the Builder at all.
 *
 * Upstream types the SP-81 signal pistol and every RSP-30/ROP-30 signal cartridge as
 * weapons. They are special-equipment items — `types` carries `"specialSlot"`, the slot
 * they occupy instead of a weapon slot — and have nothing to build. On the 2026-10-16
 * document that flag selects exactly those 8 of 172 weapons.
 */
export function isBuildableWeapon(item: { types: readonly string[] }): boolean {
  return !item.types.includes("specialSlot");
}

/**
 * Fetch the list of buildable weapons. Same filter pattern as fetchAmmoList — outer envelope
 * strict, items safe-parsed and dropped if they don't match the strict per-item schema —
 * then special-slot items dropped by `isBuildableWeapon`.
 *
 * `buyFor` comes from `createOfferResolver`, so it includes the weapon's presets' cash offers
 * and barters as well as its own: traders mostly sell weapons as presets, and the bare
 * receiver's offers alone left all but 7 weapons unreachable at LL1.
 */
export async function fetchWeaponList(client: TarkovJsonClient): Promise<WeaponListItem[]> {
  const [doc, resolveOffers] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchOfferResolver(client),
  ]);

  const all = Object.values(doc.items);
  const out: WeaponListItem[] = [];
  let special = 0;
  for (const item of all) {
    const parsed = weaponListItemSchema.safeParse({
      ...(item as object),
      buyFor: resolveOffers(item),
    });
    if (!parsed.success) continue;
    if (!isBuildableWeapon(parsed.data)) {
      special += 1;
      continue;
    }
    out.push(parsed.data);
  }
  if (out.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchWeaponList] filtered ${all.length - out.length - special} non-weapon items and ${special} special-slot items (kept ${out.length}/${all.length})`,
    );
  }
  return out;
}
