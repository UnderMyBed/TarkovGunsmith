import { z } from "zod";
import { buyForEntrySchema } from "./shared/buy-for.js";

/**
 * Stat modifiers every mod-like part carries. Fractions, not percents — see the units warning
 * in this package's CLAUDE.md: `recoilModifier: -0.21` means −21%.
 */
const modifiers = {
  ergonomics: z.number(),
  recoilModifier: z.number(),
  accuracyModifier: z.number(),
};

const partPropertiesSchema = z.discriminatedUnion("propertiesType", [
  z.object({ propertiesType: z.literal("ItemPropertiesWeaponMod"), ...modifiers }),
  z.object({ propertiesType: z.literal("ItemPropertiesBarrel"), ...modifiers }),
  z.object({ propertiesType: z.literal("ItemPropertiesScope"), ...modifiers }),
  z.object({ propertiesType: z.literal("ItemPropertiesMagazine"), ...modifiers }),
  // Cartridges sit in revolver cylinder (`camora_*`) slots. Upstream ammo does carry a
  // `recoilModifier`, but upstream's preset recoil leaves it out: the magazine-loaded AKS-74UN
  // preset 5a43a85186f7746c914b947a carries a 0.07-modifier round and reads 67, where counting
  // the round would give 74.5 (preset-oracle.test.ts). No live preset loads a cylinder, so this
  // is the nearest evidence. The ammo variant therefore exposes no stat modifiers — see `adaptMod`.
  z.object({ propertiesType: z.literal("ItemPropertiesAmmo") }),
]);

/** A slot-attachable part as the snapshot stores it: every field but its offers. */
export const snapshotPartSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  minLevelForFlea: z.number().int().nullable(),
  properties: partPropertiesSchema,
  /** Item ids this part cannot be installed alongside. Recorded one-directionally upstream. */
  conflictingItems: z.array(z.string()),
  /** Slot ids (upstream `slot.id`) this part blocks while installed. */
  conflictingSlotIds: z.array(z.string()),
});

/** A part with its offers: what the Builder catalog holds. */
export const attachablePartSchema = snapshotPartSchema.extend({
  buyFor: z.array(buyForEntrySchema).nullable(),
});

/**
 * Every item a weapon slot can accept: weapon mods, barrels, scopes, magazines, and the
 * cartridges revolver cylinders hold. Discriminated on `properties.propertiesType`.
 */
export type AttachablePart = z.infer<typeof attachablePartSchema>;
export type AttachablePartType = AttachablePart["properties"]["propertiesType"];
/** The four part types that modify weapon stats. */
export type ModLikePart = AttachablePart & {
  properties: Exclude<AttachablePart["properties"], { propertiesType: "ItemPropertiesAmmo" }>;
};

export function isModLikePart(part: AttachablePart): part is ModLikePart {
  return part.properties.propertiesType !== "ItemPropertiesAmmo";
}

/** The `properties.propertiesType` values a weapon slot can hold. */
export const PART_TYPES: ReadonlySet<string> = new Set([
  "ItemPropertiesWeaponMod",
  "ItemPropertiesBarrel",
  "ItemPropertiesScope",
  "ItemPropertiesMagazine",
  "ItemPropertiesAmmo",
]);

/** Index a catalog by id. */
export function partsById(parts: readonly AttachablePart[]): ReadonlyMap<string, AttachablePart> {
  return new Map(parts.map((p) => [p.id, p]));
}
