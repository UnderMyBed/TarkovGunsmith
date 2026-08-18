import { z } from "zod";
import type { TarkovJsonClient } from "../client.js";
import type { ArmorMaterialEntry, ItemsDocument } from "./documents.js";

const armorMaterialSchema = z.object({
  name: z.string(),
  destructibility: z.number(),
});

const armorPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesArmor"),
  class: z.number(),
  durability: z.number(),
  material: armorMaterialSchema,
  zones: z.array(z.string()),
});

const armorItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  properties: armorPropertiesSchema,
});

export const armorListSchema = z.object({
  items: z.array(armorItemSchema),
});

export type ArmorListItem = z.infer<typeof armorItemSchema>;

/**
 * Resolve an armor item's bare material id into the `{ name, destructibility }` object the
 * domain type expects.
 *
 * The GraphQL API embedded this object; the JSON API stores `properties.material` as an id
 * (`"Aramid"`) and keeps the numbers in a top-level `armorMaterials` lookup. Upstream's own
 * `name` on that entry is a game constant (`"MatAramid"`), so the id — which is what GraphQL
 * exposed as `name` — is used instead.
 *
 * Returns the item unchanged when it has no material id to resolve, letting `safeParse`
 * reject it like any other non-armor shape.
 */
function withResolvedMaterial(
  item: unknown,
  materials: Record<string, ArmorMaterialEntry>,
): unknown {
  if (item === null || typeof item !== "object") return item;
  const properties = (item as { properties?: unknown }).properties;
  if (properties === null || typeof properties !== "object") return item;
  const materialId = (properties as { material?: unknown }).material;
  if (typeof materialId !== "string") return item;

  const entry = materials[materialId];
  if (entry === undefined) return item;

  return {
    ...item,
    properties: {
      ...properties,
      material: { name: entry.id, destructibility: entry.destructibility },
    },
  };
}

/**
 * Fetch the full list of armor items.
 *
 * Selects `ItemPropertiesArmor` only — helmets are `ItemPropertiesHelmet` upstream and were
 * not in the GraphQL list either, so they stay out rather than silently widening the route.
 */
export async function fetchArmorList(client: TarkovJsonClient): Promise<ArmorListItem[]> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const materials = doc.armorMaterials ?? {};
  const all = Object.values(doc.items);
  const armorItems: ArmorListItem[] = [];
  for (const item of all) {
    const result = armorItemSchema.safeParse(withResolvedMaterial(item, materials));
    if (result.success) armorItems.push(result.data);
  }
  if (armorItems.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchArmorList] filtered ${all.length - armorItems.length} non-armor items (kept ${armorItems.length}/${all.length})`,
    );
  }
  return armorItems;
}
