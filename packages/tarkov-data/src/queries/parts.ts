import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";
import { buyForEntrySchema, resolveBuyFor, type BuyForEntry } from "./shared/buy-for.js";
import { fetchTraders } from "./traders.js";
import { fetchTasks } from "./tasks.js";

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

const attachablePartSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  minLevelForFlea: z.number().int().nullable(),
  properties: partPropertiesSchema,
  buyFor: z.array(buyForEntrySchema).nullable(),
  /** Item ids this part cannot be installed alongside. Recorded one-directionally upstream. */
  conflictingItems: z.array(z.string()),
  /** Slot ids (upstream `slot.id`) this part blocks while installed. */
  conflictingSlotIds: z.array(z.string()),
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

/** Resolves one raw upstream item to its purchase offers. */
export type OfferResolver = (item: unknown) => BuyForEntry[];

/**
 * Parse one raw upstream item as an attachable part, or `null` when it is not one (another item
 * type, or a part whose record no longer matches the schema). For callers that hold a handful of
 * ids and should not parse the whole document, such as the Open Graph card function.
 */
export function parseAttachablePart(
  item: unknown,
  resolveOffers: OfferResolver,
): AttachablePart | null {
  const type = (item as { properties?: { propertiesType?: unknown } | null } | null)?.properties
    ?.propertiesType;
  if (typeof type !== "string" || !PART_TYPES.has(type)) return null;
  // `buyFor` is the only acquisition path this resolves. Crafting and barter sourcing live in
  // upstream resources nothing here fetches (docs/adr/0002-json-api-migration.md §"deferred"),
  // so a part carries no craft/barter fields rather than always-empty ones.
  const parsed = attachablePartSchema.safeParse({
    ...(item as object),
    buyFor: resolveOffers(item),
  });
  if (parsed.success) return parsed.data;
  // A slot-attachable item failing its schema means a picker silently loses an option; say
  // which one, so `verify:upstream` and the browser console both name it.
  console.debug(`[parseAttachablePart] dropped ${String((item as { id?: unknown }).id)}`);
  return null;
}

/**
 * Pure core: select every attachable part from a translated items document.
 *
 * Items are safe-parsed one at a time and dropped on mismatch, so one odd upstream record
 * never fails the whole catalog. The returned list is plain data — no Maps, Sets or class
 * instances — so a build step can serialize it unchanged.
 */
export function selectPartCatalog(
  doc: ItemsDocument,
  resolveOffers: OfferResolver,
): AttachablePart[] {
  const out: AttachablePart[] = [];
  for (const item of Object.values(doc.items)) {
    const part = parseAttachablePart(item, resolveOffers);
    if (part !== null) out.push(part);
  }
  return out;
}

const PART_TYPES: ReadonlySet<string> = new Set([
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

/** Fetch the catalog through a client. A thin wrapper over {@link selectPartCatalog}. */
export async function fetchPartCatalog(client: TarkovJsonClient): Promise<AttachablePart[]> {
  // All three come from the client cache, so this is one network round trip in practice.
  const [doc, traders, tasks] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchTraders(client),
    fetchTasks(client),
  ]);
  return selectPartCatalog(doc, (item) => resolveBuyFor(item, traders, tasks));
}
