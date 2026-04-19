import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const MOD_LIST_QUERY = /* GraphQL */ `
  query ModList {
    items(type: mods) {
      id
      name
      shortName
      iconLink
      weight
      properties {
        __typename
        ... on ItemPropertiesWeaponMod {
          ergonomics
          recoilModifier
          accuracyModifier
        }
      }
    }
  }
`;

const modPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesWeaponMod"),
  ergonomics: z.number(),
  recoilModifier: z.number(),
  accuracyModifier: z.number(),
});

const modListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  properties: modPropertiesSchema,
});

export const modListSchema = z.object({
  items: z.array(modListItemSchema),
});

const modListEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
});

export type ModListItem = z.infer<typeof modListItemSchema>;

/**
 * Fetch the list of weapon mods that affect ergo/recoil/accuracy
 * (`ItemPropertiesWeaponMod` only — magazines, scopes, barrels, night-vision
 * are filtered out for v0.12.0; they ship in a follow-up plan that wires
 * slot-based compatibility).
 */
export async function fetchModList(client: GraphQLClient): Promise<ModListItem[]> {
  const raw = await client.request<unknown>(MOD_LIST_QUERY);
  const { items } = modListEnvelopeSchema.parse(raw);
  const out: ModListItem[] = [];
  for (const item of items) {
    const result = modListItemSchema.safeParse(item);
    if (result.success) out.push(result.data);
  }
  if (out.length < items.length && typeof console !== "undefined") {
    console.debug(
      `[fetchModList] filtered ${items.length - out.length} non-WeaponMod items (kept ${out.length}/${items.length})`,
    );
  }
  return out;
}
