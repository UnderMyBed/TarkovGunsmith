import { buildSlotGraph, selectWeaponTree, type WeaponTree } from "@tarkov/data";

/** One slot in a hand-built tree. An item is an id, or `[id, its own slots]`. */
export interface SlotSpec {
  nameId: string;
  id?: string;
  required?: boolean;
  items: readonly (string | readonly [string, readonly SlotSpec[]])[];
}

/**
 * Build a `WeaponTree` from a nested spec by way of a tiny raw items document, so tests exercise
 * the real `buildSlotGraph` / `expandSlots` path rather than hand-rolled nodes. Structure only:
 * no stat values live here, so nothing in it can drift from upstream's units.
 */
export function tinyTree(weaponId: string, slots: readonly SlotSpec[]): WeaponTree {
  const items: Record<string, unknown> = {};
  const rawSlots = (owner: string, specs: readonly SlotSpec[]): unknown[] =>
    specs.map((spec) => ({
      id: spec.id ?? `${owner}:${spec.nameId}`,
      nameId: spec.nameId,
      name: spec.nameId,
      required: spec.required ?? false,
      filters: {
        allowedCategories: [],
        allowedItems: spec.items.map((entry) => {
          const [id, children] = typeof entry === "string" ? [entry, []] : entry;
          items[id] ??= {
            id,
            name: id,
            properties: { propertiesType: "ItemPropertiesWeaponMod", slots: [] },
          };
          if (children.length > 0) {
            (items[id] as { properties: { slots: unknown[] } }).properties.slots = rawSlots(
              id,
              children,
            );
          }
          return id;
        }),
      },
    }));
  items[weaponId] = {
    id: weaponId,
    name: weaponId,
    properties: { propertiesType: "ItemPropertiesWeapon", slots: rawSlots(weaponId, slots) },
  };
  const doc = { items };
  return selectWeaponTree(doc, weaponId, buildSlotGraph(doc));
}
