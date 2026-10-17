import type { ItemsDocument } from "./documents.js";

/**
 * The weapon slot graph, kept lazy.
 *
 * Upstream describes compatibility as slots on items: a weapon has slots, each slot allows a
 * list of item ids, and many of those items have slots of their own — weapon mods, but also
 * barrels (a gas block, a muzzle), scopes (a mount), and magazines. Fully expanding that from a
 * weapon is enormous (the M4A1 alone is ~29,000 nodes at full depth) and pointless: a player only
 * ever sees the slots of what is actually attached. So the graph is stored once, per owning item
 * id, and expanded one level at a time from the item that is attached.
 *
 * The live document has no cycles (verified 2026-10 by DFS), but walkers here still carry an
 * ancestor guard so a future cycle cannot hang the Builder or the optimizer.
 */

export interface SlotCategory {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

/** One upstream slot on one owning item. Plain data: serializable as-is. */
export interface SlotDef {
  /** Upstream `slot.id`. Globally unique; what `conflictingSlotIds` refers to. */
  readonly id: string;
  /** Upstream `slot.nameId` (e.g. `mod_muzzle`). The segment slot paths are built from. */
  readonly nameId: string;
  readonly name: string;
  readonly required: boolean;
  /** Allowed item ids, in upstream order, limited to ids present in the document. */
  readonly allowedItemIds: readonly string[];
  readonly allowedCategories: readonly SlotCategory[];
}

export interface SlotOwner {
  /** The owner's `properties.propertiesType`. */
  readonly kind: string;
  readonly slots: readonly SlotDef[];
}

/**
 * Every slot-owning item's slots, keyed by owner id, plus display names for allowed items.
 * `itemShortNames` feeds {@link SlotNode.label} only; neither name map is serialized.
 */
export interface SlotGraph {
  readonly owners: Readonly<Record<string, SlotOwner>>;
  readonly itemNames: Readonly<Record<string, string>>;
  readonly itemShortNames: Readonly<Record<string, string>>;
}

/** A slot placed at a concrete path in one build. */
export interface SlotNode {
  readonly id: string;
  readonly nameId: string;
  /** Upstream's translated slot name. Siblings can share it (two "Ch. Handle" on the M4A1). */
  readonly name: string;
  /**
   * The name to show: unique among the slots of one owner. Display only — never a key. See
   * {@link slotLabels} for the rule.
   */
  readonly label: string;
  /** `/`-joined `nameId` chain from the weapon. The key a build's `attachments` map uses. */
  readonly path: string;
  readonly required: boolean;
  readonly allowedItems: readonly { readonly id: string; readonly name: string }[];
  readonly allowedItemIds: ReadonlySet<string>;
  readonly allowedCategories: readonly SlotCategory[];
}

export interface WeaponTree {
  readonly weaponId: string;
  readonly weaponName: string;
  /** The weapon's own slots. Deeper slots come from {@link expandSlots} on attached items. */
  readonly slots: readonly SlotNode[];
  /** The shared graph deeper slots expand from. */
  readonly graph: SlotGraph;
}

interface RawSlotShape {
  id?: unknown;
  nameId?: unknown;
  name?: unknown;
  required?: unknown;
  filters?: { allowedItems?: unknown; allowedCategories?: unknown } | null;
}

function asCategory(raw: unknown): SlotCategory | null {
  if (raw === null || typeof raw !== "object") return null;
  const { id, name, normalizedName } = raw as Record<string, unknown>;
  if (typeof id !== "string" || typeof name !== "string" || typeof normalizedName !== "string") {
    return null;
  }
  return { id, name, normalizedName };
}

function itemName(raw: unknown, fallback: string, field: "name" | "shortName" = "name"): string {
  const name = (raw as Record<string, unknown> | null)?.[field];
  return typeof name === "string" ? name : fallback;
}

/**
 * Pure core: build the slot graph from a translated items document.
 *
 * Every item with a non-empty `properties.slots` is an owner, whatever its type. That is the
 * #214 fix: the old tree only recursed into `ItemPropertiesWeaponMod`, which hid every slot on a
 * barrel or scope — including required ones such as a barrel's gas block.
 */
export function buildSlotGraph(doc: ItemsDocument): SlotGraph {
  const categories = doc.itemCategories ?? {};
  const owners: Record<string, SlotOwner> = {};
  const itemNames: Record<string, string> = {};
  const itemShortNames: Record<string, string> = {};

  for (const [ownerId, raw] of Object.entries(doc.items)) {
    const properties = (
      raw as { properties?: { propertiesType?: unknown; slots?: unknown } | null }
    )?.properties;
    if (!properties || !Array.isArray(properties.slots) || properties.slots.length === 0) continue;

    const slots: SlotDef[] = [];
    for (const rawSlot of properties.slots as unknown[]) {
      const slot = (rawSlot ?? {}) as RawSlotShape;
      const nameId = typeof slot.nameId === "string" ? slot.nameId : "";
      const allowedItemIds: string[] = [];
      const rawAllowed = Array.isArray(slot.filters?.allowedItems) ? slot.filters.allowedItems : [];
      for (const id of rawAllowed as unknown[]) {
        if (typeof id !== "string") continue;
        const found = doc.items[id];
        if (found === null || typeof found !== "object") continue;
        allowedItemIds.push(id);
        itemNames[id] ??= itemName(found, id);
        itemShortNames[id] ??= itemName(found, itemNames[id], "shortName");
      }

      // Kept as working, inert future-proofing: every slot in the live document carries an
      // EMPTY allowedCategories (verified 2026-08-18, docs/operations/data-api-audit.md), so
      // this resolves nothing today. Re-check before building on it.
      const allowedCategories: SlotCategory[] = [];
      const rawCategories = Array.isArray(slot.filters?.allowedCategories)
        ? slot.filters.allowedCategories
        : [];
      for (const entry of rawCategories as unknown[]) {
        const resolved = typeof entry === "string" ? categories[entry] : entry;
        const category = asCategory(resolved);
        if (category !== null) allowedCategories.push(category);
      }

      slots.push({
        id: typeof slot.id === "string" ? slot.id : "",
        nameId,
        name: typeof slot.name === "string" ? slot.name : nameId,
        required: slot.required === true,
        allowedItemIds,
        allowedCategories,
      });
    }
    owners[ownerId] = {
      kind: typeof properties.propertiesType === "string" ? properties.propertiesType : "",
      slots,
    };
  }
  return { owners, itemNames, itemShortNames };
}

/**
 * Display labels for one owner's slots, in the same order. Upstream reuses slot names among
 * siblings (`mod_mount_000..003` are all "Mount"; the M4A1's `mod_charge_001`, which only takes
 * the B.A.D. lever, is a second "Ch. Handle"), so a name alone cannot tell two rows apart:
 *
 * 1. A name no sibling shares is the label as-is.
 * 2. A shared name on a slot with exactly one allowed item is qualified by that item's short
 *    name: "Ch. Handle (B.A.D.)".
 * 3. Whatever still repeats is numbered in upstream order, every member: "Mount 1", "Mount 2".
 */
export function slotLabels(
  slots: readonly Pick<SlotDef, "name" | "allowedItemIds">[],
  shortName: (itemId: string) => string,
): string[] {
  return labelled(slots, shortName).map(({ label }) => label);
}

function labelled<T extends Pick<SlotDef, "name" | "allowedItemIds">>(
  slots: readonly T[],
  shortName: (itemId: string) => string,
): { slot: T; label: string }[] {
  // Siblings number a few dozen at most, so counting by scan is cheap.
  const qualified = slots.map((slot) => {
    const [only, ...rest] = slot.allowedItemIds;
    const shared = slots.filter((s) => s.name === slot.name).length > 1;
    const label =
      shared && only !== undefined && rest.length === 0
        ? `${slot.name} (${shortName(only)})`
        : slot.name;
    return { slot, label };
  });
  return qualified.map(({ slot, label }, i) => {
    const same = qualified.filter((q) => q.label === label);
    if (same.length < 2) return { slot, label };
    const ordinal = qualified.slice(0, i + 1).filter((q) => q.label === label).length;
    return { slot, label: `${label} ${ordinal}` };
  });
}

interface PreparedSlot {
  readonly def: SlotDef;
  readonly label: string;
  readonly allowedItems: SlotNode["allowedItems"];
  readonly allowedItemIds: ReadonlySet<string>;
}

// Derived per-owner data (Sets, name-joined option lists) cached beside the plain graph so the
// graph itself stays serializable and the optimizer's repeated expansions stay cheap.
const prepared = new WeakMap<SlotGraph, Map<string, readonly PreparedSlot[]>>();

function preparedSlots(graph: SlotGraph, ownerId: string): readonly PreparedSlot[] {
  let byOwner = prepared.get(graph);
  if (byOwner === undefined) {
    byOwner = new Map();
    prepared.set(graph, byOwner);
  }
  const cached = byOwner.get(ownerId);
  if (cached !== undefined) return cached;
  const defs = graph.owners[ownerId]?.slots ?? [];
  const out: PreparedSlot[] = labelled(defs, (id) => graph.itemShortNames[id] ?? id).map(
    ({ slot: def, label }) => ({
      def,
      label,
      allowedItems: def.allowedItemIds.map((id) => ({ id, name: graph.itemNames[id] ?? id })),
      allowedItemIds: new Set(def.allowedItemIds),
    }),
  );
  byOwner.set(ownerId, out);
  return out;
}

/**
 * Expand one level: the slots of `ownerId`, placed under `parentPath`.
 *
 * `parentPath` is the path of the slot the owner is attached in (`""` for the weapon itself).
 * Paths are `/`-joined `nameId` chains — the encoding every saved build since v2 uses, so it
 * must not change. An owner with no slots expands to `[]`.
 */
export function expandSlots(graph: SlotGraph, ownerId: string, parentPath: string): SlotNode[] {
  return preparedSlots(graph, ownerId).map(({ def, label, allowedItems, allowedItemIds }) => ({
    id: def.id,
    nameId: def.nameId,
    name: def.name,
    label,
    path: parentPath ? `${parentPath}/${def.nameId}` : def.nameId,
    required: def.required,
    allowedItems,
    allowedItemIds,
    allowedCategories: def.allowedCategories,
  }));
}

/**
 * Pure core: one weapon's tree over a graph. Throws for a missing or non-weapon id, which the
 * Builder's error boundary already handles.
 */
export function selectWeaponTree(
  doc: ItemsDocument,
  weaponId: string,
  graph: SlotGraph = buildSlotGraph(doc),
): WeaponTree {
  const raw = doc.items[weaponId];
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error(`Weapon "${weaponId}" not found in the items document`);
  }
  const item = raw as { id?: unknown; name?: unknown; properties?: unknown };
  const properties = item.properties as { propertiesType?: unknown } | null | undefined;
  if (properties?.propertiesType !== "ItemPropertiesWeapon") {
    throw new Error(`Item "${weaponId}" is not a weapon (properties.propertiesType mismatch)`);
  }
  const id = typeof item.id === "string" ? item.id : weaponId;
  return {
    weaponId: id,
    weaponName: itemName(item, weaponId),
    slots: expandSlots(graph, weaponId, ""),
    graph,
  };
}

/**
 * Every slot a build currently shows, in pre-order: the weapon's slots, then for each slot
 * holding an item that slot allows, that item's slots, recursively.
 *
 * An attachment whose item the slot does not allow (a stale saved key) is not expanded, and an
 * item already attached above itself is not expanded again (the cycle guard).
 */
export function visibleSlots(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
): SlotNode[] {
  const out: SlotNode[] = [];
  const walk = (slots: readonly SlotNode[], ancestors: ReadonlySet<string>): void => {
    for (const slot of slots) {
      out.push(slot);
      const itemId = attachments[slot.path];
      if (itemId === undefined || !slot.allowedItemIds.has(itemId) || ancestors.has(itemId)) {
        continue;
      }
      walk(expandSlots(tree.graph, itemId, slot.path), new Set([...ancestors, itemId]));
    }
  };
  walk(tree.slots, new Set([tree.weaponId]));
  return out;
}

/**
 * The slot at `path` in this build, resolved segment by segment through the attached items, or
 * `null` when the path does not exist (a segment's parent slot is empty, holds an item it does
 * not allow, or has no such child slot).
 */
export function slotAtPath(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
  path: string,
): SlotNode | null {
  const segments = path.split("/");
  let slots: readonly SlotNode[] = tree.slots;
  for (let i = 0; i < segments.length; i++) {
    const nameId = segments[i];
    const slot = slots.find((s) => s.nameId === nameId);
    if (slot === undefined) return null;
    if (i === segments.length - 1) return slot;
    const itemId = attachments[slot.path];
    if (itemId === undefined || !slot.allowedItemIds.has(itemId)) return null;
    slots = expandSlots(tree.graph, itemId, slot.path);
  }
  return null;
}
