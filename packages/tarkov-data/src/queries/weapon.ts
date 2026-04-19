import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const WEAPON_QUERY = /* GraphQL */ `
  query Weapon($id: ID!) {
    item(id: $id) {
      id
      name
      shortName
      iconLink
      weight
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          ergonomics
          recoilVertical
          recoilHorizontal
          caliber
          fireRate
        }
      }
    }
  }
`;

const weaponPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesWeapon"),
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
export async function fetchWeapon(client: GraphQLClient, id: string): Promise<Weapon> {
  const raw = await client.request<unknown>(WEAPON_QUERY, { id });
  return weaponSchema.parse(raw).item;
}
