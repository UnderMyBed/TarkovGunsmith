import { z } from "zod";
import { buyForEntrySchema } from "./shared/buy-for.js";

/**
 * Stat modifiers every mod-like part carries. `recoilModifier` and `accuracyModifier` are
 * fractions, not percents — see the units warning in this package's CLAUDE.md:
 * `recoilModifier: -0.21` means −21%. `velocity` is a PERCENT (the AR-15 10.3" barrel's -11
 * is −11%); upstream sends it at the item's top level, and {@link partRecord} moves it here.
 */
const modifiers = {
  ergonomics: z.number(),
  recoilModifier: z.number(),
  accuracyModifier: z.number(),
  velocity: z.number(),
};

const partPropertiesSchema = z.discriminatedUnion("propertiesType", [
  z.object({ propertiesType: z.literal("ItemPropertiesWeaponMod"), ...modifiers }),
  z.object({
    propertiesType: z.literal("ItemPropertiesBarrel"),
    ...modifiers,
    /** Centimetres of dispersion at 100 m, added to the weapon's own. */
    centerOfImpact: z.number(),
    deviationMax: z.number(),
  }),
  z.object({
    propertiesType: z.literal("ItemPropertiesScope"),
    ...modifiers,
    /** Metres. Upstream reports 0 for some reflex sights. */
    sightingRange: z.number(),
  }),
  z.object({
    propertiesType: z.literal("ItemPropertiesMagazine"),
    ...modifiers,
    /** Rounds. */
    capacity: z.number().int(),
    /** A signed fraction, as upstream reports it (live -0.35..0.25). */
    loadModifier: z.number(),
    /** A fraction (live 0..0.5). */
    malfunctionChance: z.number(),
  }),
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

/**
 * An upstream part record in the shape {@link snapshotPartSchema} parses: the top-level
 * `velocity` of a mod-like part moves into its `properties`, beside the other modifiers.
 * Upstream gives ammo no top-level `velocity` (its speed is `properties.initialSpeed`), so a
 * cartridge's properties are left as they are. A mod-like part missing `velocity` keeps
 * missing it, and fails the parse.
 */
export function partRecord(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const record = raw as { velocity?: unknown; properties?: unknown };
  const properties = record.properties as { propertiesType?: unknown } | null | undefined;
  if (
    properties === null ||
    typeof properties !== "object" ||
    properties.propertiesType === "ItemPropertiesAmmo" ||
    !("velocity" in record)
  ) {
    return raw;
  }
  return { ...record, properties: { ...properties, velocity: record.velocity } };
}

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
