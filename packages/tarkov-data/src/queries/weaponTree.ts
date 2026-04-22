import { z } from "zod";
import type { GraphQLClient } from "../client.js";
import type { SlotNodeForMigration } from "../build-migrations.js";

/** Max tree depth we fetch in a single GraphQL request. */
const RECURSION_DEPTH = 4;

/**
 * Build the recursive slot selection fragment to depth N. Hand-rolled because
 * GraphQL fragment spreads can't self-reference.
 *
 * At the innermost level (depth === 1) the allowed items omit the
 * `properties { ... slots { ... } }` inner block entirely. Emitting it with
 * an empty `slots {}` produced invalid GraphQL ("Expected Name, found '}'")
 * — the whole `/builder` route errored out on slot-tree load as a result.
 */
function buildSlotSelection(depth: number): string {
  if (depth <= 0) return "";
  const propertiesBlock =
    depth > 1
      ? `
        properties {
          __typename
          ... on ItemPropertiesWeaponMod {
            slots {${buildSlotSelection(depth - 1)}}
          }
        }`
      : "";
  return `
    id
    nameId
    name
    required
    filters {
      allowedItems {
        id
        name${propertiesBlock}
      }
      allowedCategories {
        id
        name
        normalizedName
      }
    }`;
}

export const WEAPON_TREE_QUERY = /* GraphQL */ `
  query WeaponTree($id: ID!) {
    item(id: $id) {
      id
      name
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          slots {${buildSlotSelection(RECURSION_DEPTH)}}
        }
      }
    }
  }
`;

// Envelope Zod validates only the outer shell. The normalizer does the
// runtime shape handling — cheaper than modelling the whole cyclic tree in
// Zod (z.lazy + transforms would work but hit ts(2589) in practice).
const WeaponTreeEnvelope = z.object({
  item: z
    .object({
      id: z.string(),
      name: z.string(),
      properties: z.object({ __typename: z.string() }).passthrough(),
    })
    .nullable(),
});

// ---------- Normalized output types ----------

export interface SlotCategory {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

export interface SlotNode extends SlotNodeForMigration {
  readonly name: string;
  readonly required: boolean;
  readonly allowedItems: readonly AllowedItem[];
  readonly allowedCategories: readonly SlotCategory[];
  readonly children: readonly SlotNode[];
}

export interface AllowedItem {
  readonly id: string;
  readonly name: string;
  readonly children: readonly SlotNode[];
}

export interface WeaponTree {
  readonly weaponId: string;
  readonly weaponName: string;
  readonly slots: readonly SlotNode[];
}

// ---------- Fetcher ----------

export async function fetchWeaponTree(
  client: GraphQLClient,
  weaponId: string,
): Promise<WeaponTree> {
  const raw = await client.request<unknown>(WEAPON_TREE_QUERY, { id: weaponId });
  const env = WeaponTreeEnvelope.parse(raw);
  if (!env.item) {
    throw new Error(`Weapon "${weaponId}" not found in tarkov-api response`);
  }
  if (env.item.properties.__typename !== "ItemPropertiesWeapon") {
    throw new Error(`Item "${weaponId}" is not a weapon (properties.__typename mismatch)`);
  }
  const rawSlots = (env.item.properties as { slots?: unknown[] }).slots ?? [];
  return {
    weaponId: env.item.id,
    weaponName: env.item.name,
    slots: normalizeSlots(rawSlots, ""),
  };
}

// ---------- Normalizer (exported for direct testing) ----------

interface RawItemShape {
  id: string;
  name: string;
  properties?: { __typename: string; slots?: unknown[] };
}

interface RawSlotShape {
  id: string;
  nameId: string;
  name: string;
  required: boolean;
  filters: {
    allowedItems: RawItemShape[];
    allowedCategories?: Array<SlotCategory | null> | null;
  } | null;
}

export function normalizeSlots(slots: readonly unknown[], parentPath: string): readonly SlotNode[] {
  return slots.map((raw) => {
    const s = raw as RawSlotShape;
    const path = parentPath ? `${parentPath}/${s.nameId}` : s.nameId;
    const items: readonly AllowedItem[] = (s.filters?.allowedItems ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      children: normalizeSlots(
        item.properties?.__typename === "ItemPropertiesWeaponMod"
          ? (item.properties.slots ?? [])
          : [],
        path,
      ),
    }));
    const categories: readonly SlotCategory[] = (s.filters?.allowedCategories ?? []).filter(
      (c): c is SlotCategory => c != null,
    );
    return {
      nameId: s.nameId,
      name: s.name,
      path,
      required: s.required,
      allowedItems: items,
      allowedCategories: categories,
      allowedItemIds: new Set(items.map((i) => i.id)),
      children: items.flatMap((i) => i.children),
    };
  });
}
