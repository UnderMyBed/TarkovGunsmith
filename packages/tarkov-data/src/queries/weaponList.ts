import { z } from "zod";
import { buyForEntrySchema } from "./shared/buy-for.js";

const weaponPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesWeapon"),
  caliber: z.string(),
  ergonomics: z.number(),
  recoilVertical: z.number(),
  recoilHorizontal: z.number(),
  fireRate: z.number(),
});

/** A buildable weapon as the snapshot stores it: every field but its offers. */
export const snapshotWeaponSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  properties: weaponPropertiesSchema,
});

const weaponListItemSchema = snapshotWeaponSchema.extend({
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
