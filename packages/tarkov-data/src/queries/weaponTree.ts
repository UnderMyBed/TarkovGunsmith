import type { TarkovJsonClient } from "../client.js";
import type { SlotNodeForMigration } from "../build-migrations.js";
import type { ItemsDocument } from "./documents.js";

/**
 * Max tree depth we resolve.
 *
 * Held at 3 to match the behaviour the GraphQL implementation shipped. That limit was a
 * payload constraint — depth 4 returned ~7.5 MB for the M4A1 over the wire — which no longer
 * applies now that resolution happens client-side over an already-loaded document. Raising it
 * is a deliberate behaviour change and stays deferred rather than riding along with a
 * transport migration.
 */
const RECURSION_DEPTH = 3;

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

/**
 * Lookup tables the normalizer resolves ids against.
 *
 * The GraphQL API returned allowed items as fully nested objects. The JSON API returns bare
 * id strings, so the tree is assembled here instead of arriving pre-built.
 */
export interface SlotResolutionContext {
  readonly items: Record<string, unknown>;
  readonly categories: Record<string, unknown>;
}

interface RawSlotShape {
  id?: unknown;
  nameId?: unknown;
  name?: unknown;
  required?: unknown;
  filters?: {
    allowedItems?: unknown;
    allowedCategories?: unknown;
  } | null;
}

function asCategory(raw: unknown): SlotCategory | null {
  if (raw === null || typeof raw !== "object") return null;
  const { id, name, normalizedName } = raw as Record<string, unknown>;
  if (typeof id !== "string" || typeof name !== "string" || typeof normalizedName !== "string") {
    return null;
  }
  return { id, name, normalizedName };
}

/**
 * Normalize a raw slot list into the tree the Builder renders.
 *
 * `depth` bounds recursion. It is a hard requirement rather than a performance guard: slot
 * graphs contain cycles — a handguard permits a mount whose own slot permits that handguard —
 * so unbounded resolution would not terminate.
 */
export function normalizeSlots(
  slots: readonly unknown[],
  parentPath: string,
  ctx: SlotResolutionContext,
  depth: number = RECURSION_DEPTH,
): readonly SlotNode[] {
  if (depth <= 0) return [];

  return slots.map((raw) => {
    const slot = raw as RawSlotShape;
    const nameId = typeof slot.nameId === "string" ? slot.nameId : "";
    const path = parentPath ? `${parentPath}/${nameId}` : nameId;

    const allowedIds = Array.isArray(slot.filters?.allowedItems) ? slot.filters.allowedItems : [];
    const items: AllowedItem[] = [];
    for (const id of allowedIds) {
      if (typeof id !== "string") continue;
      const found = ctx.items[id];
      if (found === null || typeof found !== "object") continue;
      const properties = (found as { properties?: unknown }).properties as
        | { propertiesType?: unknown; slots?: unknown }
        | undefined;
      const childSlots =
        properties?.propertiesType === "ItemPropertiesWeaponMod" && Array.isArray(properties.slots)
          ? properties.slots
          : [];
      const name = (found as { name?: unknown }).name;
      items.push({
        id,
        name: typeof name === "string" ? name : id,
        children: normalizeSlots(childSlots, path, ctx, depth - 1),
      });
    }

    const rawCategories = Array.isArray(slot.filters?.allowedCategories)
      ? slot.filters.allowedCategories
      : [];
    const categories: SlotCategory[] = [];
    for (const entry of rawCategories) {
      // Upstream sends category ids; resolve them against the document's category table.
      const resolved = typeof entry === "string" ? ctx.categories[entry] : entry;
      const category = asCategory(resolved);
      if (category !== null) categories.push(category);
    }

    return {
      nameId,
      name: typeof slot.name === "string" ? slot.name : nameId,
      path,
      required: slot.required === true,
      allowedItems: items,
      allowedCategories: categories,
      allowedItemIds: new Set(items.map((i) => i.id)),
      children: items.flatMap((i) => i.children),
    };
  });
}

/**
 * Fetch and normalize the slot tree for one weapon.
 *
 * Throws rather than returning null for a missing or non-weapon id, matching the behaviour
 * the GraphQL implementation had — the Builder's error boundary already handles it.
 */
export async function fetchWeaponTree(
  client: TarkovJsonClient,
  weaponId: string,
): Promise<WeaponTree> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const raw = doc.items[weaponId];
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error(`Weapon "${weaponId}" not found in the items document`);
  }

  const item = raw as { id?: unknown; name?: unknown; properties?: unknown };
  const properties = item.properties as
    | { propertiesType?: unknown; slots?: unknown }
    | undefined;
  if (properties?.propertiesType !== "ItemPropertiesWeapon") {
    throw new Error(`Item "${weaponId}" is not a weapon (properties.propertiesType mismatch)`);
  }

  const ctx: SlotResolutionContext = {
    items: doc.items,
    categories: (doc as { itemCategories?: Record<string, unknown> }).itemCategories ?? {},
  };

  return {
    weaponId: typeof item.id === "string" ? item.id : weaponId,
    weaponName: typeof item.name === "string" ? item.name : weaponId,
    slots: normalizeSlots(Array.isArray(properties.slots) ? properties.slots : [], "", ctx),
  };
}
