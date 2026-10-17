import type { AttachablePart } from "./queries/parts.js";
import { visibleSlots, type WeaponTree } from "./queries/slot-graph.js";

export interface AttachedPartEntry {
  /** Slot path the part occupies (the attachments-map key). */
  readonly path: string;
  readonly part: AttachablePart;
}

export interface AttachedParts {
  /** One entry per mounted attachment, in slot pre-order. A part in two slots appears twice. */
  readonly entries: readonly AttachedPartEntry[];
  /** Attachments whose item id is not in the catalog (upstream removed or renamed it). */
  readonly missing: readonly { readonly path: string; readonly itemId: string }[];
}

/**
 * Set or clear the item at `path`, returning a new map.
 *
 * When the item at `path` changes or is cleared, every key beneath it (`${path}/…`) goes too:
 * those slots belonged to the old item, and a same-named slot on the new one is a different
 * slot with its own allowed items and conflicts. Re-selecting the item already there changes
 * nothing.
 */
export function withAttachment(
  attachments: Readonly<Record<string, string>>,
  path: string,
  itemId: string | null,
): Record<string, string> {
  if ((attachments[path] ?? null) === itemId) return { ...attachments };
  const prefix = `${path}/`;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(attachments)) {
    if (key !== path && !key.startsWith(prefix)) next[key] = value;
  }
  if (itemId !== null) next[path] = itemId;
  return next;
}

/** The ids that exist upstream: the part catalog by id, or the items document's ids. */
export interface KnownItems {
  has(itemId: string): boolean;
}

/**
 * The attachments actually on the weapon: keys whose slot the build shows (see
 * {@link visibleSlots}) and whose slot accepts the item, in pre-order.
 *
 * A key under an empty or replaced parent, or an item its slot does not allow, is left out,
 * matching what the slot tree displays. The one exception is an id `known` does not hold at all:
 * that is a part gone upstream, kept so {@link attachedParts} can report it as missing. A part
 * that exists but no slot allows (most cartridges, placeholder magazines) is not on the weapon.
 */
export function mountedAttachments(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
  known: KnownItems,
): Record<string, string> {
  const mounted: Record<string, string> = {};
  for (const slot of visibleSlots(tree, attachments)) {
    const itemId = attachments[slot.path];
    if (itemId === undefined) continue;
    if (!slot.allowedItemIds.has(itemId) && known.has(itemId)) continue;
    mounted[slot.path] = itemId;
  }
  return mounted;
}

/**
 * Resolve the parts on a build's weapon against the part catalog, one entry per slot.
 *
 * Stats, price, drift and the attachment count are all computed from this, so every consumer
 * counts the same parts: only the {@link mountedAttachments}, never a stale key left beneath a
 * removed or replaced part. Entries are per slot rather than over a de-duplicated id set: a
 * part fitted in two slots is two physical parts, so it counts twice for weight, stats and
 * price alike.
 */
export function attachedParts(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
  byId: ReadonlyMap<string, AttachablePart>,
): AttachedParts {
  const entries: AttachedPartEntry[] = [];
  const missing: { path: string; itemId: string }[] = [];
  for (const [path, itemId] of Object.entries(mountedAttachments(tree, attachments, byId))) {
    const part = byId.get(itemId);
    if (part === undefined) missing.push({ path, itemId });
    else entries.push({ path, part });
  }
  return { entries, missing };
}

/** The flea-market price of one part in RUB, or 0 when it has no flea offer. */
export function fleaPriceRub(part: AttachablePart): number {
  return (part.buyFor ?? []).find((b) => b.vendor.__typename === "FleaMarket")?.priceRUB ?? 0;
}
