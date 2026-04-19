import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const ARMOR_LIST_QUERY = /* GraphQL */ `
  query ArmorList {
    items(type: armor) {
      id
      name
      shortName
      iconLink
      properties {
        __typename
        ... on ItemPropertiesArmor {
          class
          durability
          material {
            name
            destructibility
          }
          zones
        }
      }
    }
  }
`;

const armorMaterialSchema = z.object({
  name: z.string(),
  destructibility: z.number(),
});

const armorPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesArmor"),
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

const armorListEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
});

export type ArmorListItem = z.infer<typeof armorItemSchema>;

/**
 * Fetch the full list of armor items.
 *
 * The upstream `items(type: armor)` query returns mixed types — actual armor
 * (`ItemPropertiesArmor`) plus chest rigs (`ItemPropertiesChestRig`). Same
 * filter pattern as `fetchAmmoList`: outer envelope strict, items
 * `safeParse`d and dropped if they don't match.
 */
export async function fetchArmorList(client: GraphQLClient): Promise<ArmorListItem[]> {
  const raw = await client.request<unknown>(ARMOR_LIST_QUERY);
  const { items } = armorListEnvelopeSchema.parse(raw);
  const armorItems: ArmorListItem[] = [];
  for (const item of items) {
    const result = armorItemSchema.safeParse(item);
    if (result.success) armorItems.push(result.data);
  }
  if (armorItems.length < items.length && typeof console !== "undefined") {
    console.debug(
      `[fetchArmorList] filtered ${items.length - armorItems.length} non-armor items (kept ${armorItems.length}/${items.length})`,
    );
  }
  return armorItems;
}
