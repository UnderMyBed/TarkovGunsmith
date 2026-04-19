import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const AMMO_LIST_QUERY = /* GraphQL */ `
  query AmmoList {
    items(type: ammo) {
      id
      name
      shortName
      iconLink
      properties {
        __typename
        ... on ItemPropertiesAmmo {
          caliber
          penetrationPower
          damage
          armorDamage
          projectileCount
        }
      }
    }
  }
`;

const ammoPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesAmmo"),
  caliber: z.string(),
  penetrationPower: z.number(),
  damage: z.number(),
  armorDamage: z.number(),
  projectileCount: z.number(),
});

const ammoItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  properties: ammoPropertiesSchema,
});

export const ammoListSchema = z.object({
  items: z.array(ammoItemSchema),
});

const ammoListEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
});

export type AmmoListItem = z.infer<typeof ammoItemSchema>;

/**
 * Fetch the full list of ammo items.
 *
 * The upstream `items(type: ammo)` query returns mixed types — actual ammo
 * (`ItemPropertiesAmmo`) plus grenades (`ItemPropertiesGrenade`). We validate
 * the outer envelope strictly, then `safeParse` each item against
 * {@link ammoItemSchema} and silently drop the ones that don't match. A single
 * unrelated item shape never fails the whole call.
 *
 * Logs a `console.debug` line listing how many items were filtered, so unusual
 * upstream changes (a new `ItemPropertiesX` variant we should map) are
 * discoverable in the browser console.
 */
export async function fetchAmmoList(client: GraphQLClient): Promise<AmmoListItem[]> {
  const raw = await client.request<unknown>(AMMO_LIST_QUERY);
  const { items } = ammoListEnvelopeSchema.parse(raw);
  const ammoItems: AmmoListItem[] = [];
  for (const item of items) {
    const result = ammoItemSchema.safeParse(item);
    if (result.success) ammoItems.push(result.data);
  }
  if (ammoItems.length < items.length && typeof console !== "undefined") {
    console.debug(
      `[fetchAmmoList] filtered ${items.length - ammoItems.length} non-ammo items (kept ${ammoItems.length}/${items.length})`,
    );
  }
  return ammoItems;
}
