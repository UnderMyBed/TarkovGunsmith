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

export type ArmorListItem = z.infer<typeof armorItemSchema>;

/**
 * Fetch the full list of armor items, validated against {@link armorListSchema}.
 */
export async function fetchArmorList(client: GraphQLClient): Promise<ArmorListItem[]> {
  const raw = await client.request<unknown>(ARMOR_LIST_QUERY);
  return armorListSchema.parse(raw).items;
}
