import { z } from "zod";
import { buyForEntrySchema } from "./shared/buy-for.js";

/**
 * Units are upstream's: `fireRate` rounds per minute, `effectiveDistance` and `sightingRange`
 * metres, `centerOfImpact` centimetres at 100 m. Live ranges are in
 * docs/operations/data-api-audit.md.
 */
const weaponPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesWeapon"),
  caliber: z.string(),
  ergonomics: z.number(),
  recoilVertical: z.number(),
  recoilHorizontal: z.number(),
  fireRate: z.number(),
  centerOfImpact: z.number(),
  deviationCurve: z.number(),
  effectiveDistance: z.number(),
  sightingRange: z.number(),
});

/**
 * A buildable weapon as upstream sends it, as far as the Builder reads it. `velocity` is a
 * top-level field upstream, and a PERCENT (the AKM's 1.8 is +1.8%); `defaultAmmo` is an item
 * id the snapshot generator resolves into {@link SnapshotDefaultAmmo}.
 */
export const weaponRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  velocity: z.number(),
  properties: weaponPropertiesSchema.extend({ defaultAmmo: z.string() }),
});

/** What the snapshot keeps of a weapon's default ammo: its name and speed in m/s. */
export const defaultAmmoSchema = z.object({
  id: z.string(),
  shortName: z.string(),
  initialSpeed: z.number().positive(),
});
export type SnapshotDefaultAmmo = z.infer<typeof defaultAmmoSchema>;

/**
 * A buildable weapon as the snapshot stores it: every field but its offers, with its default
 * ammo resolved. `defaultAmmo` is `null` when upstream publishes no ballistic record for it
 * (the RShG-2's rocket, whose `properties` are null).
 */
export const snapshotWeaponSchema = weaponRecordSchema.extend({
  properties: weaponPropertiesSchema,
  defaultAmmo: defaultAmmoSchema.nullable(),
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
