import type { AttachablePart } from "../queries/parts.js";
import type { WeaponListItem } from "../queries/weaponList.js";
import { expandSlots, type SlotGraph, type WeaponTree } from "../queries/slot-graph.js";
import {
  offerPriceIds,
  priceFleaOffer,
  priceOffers,
  type BuyForEntry,
} from "../queries/shared/buy-for.js";
import type { PriceTable } from "../prices/table.js";
import type { WeaponPreset } from "../queries/presets.js";
import type { BuilderSnapshot, SnapshotPart } from "./types.js";
import { ORPHANED_CAP } from "../build-schema.js";

interface Derived {
  readonly graph: SlotGraph;
  readonly names: ReadonlyMap<string, string>;
  readonly parts: ReadonlyMap<string, SnapshotPart>;
  readonly weaponNames: ReadonlyMap<string, string>;
}

// Built once per snapshot object. The snapshot is immutable for the life of the page, so the
// graph every tree shares, and the name lookup barter costs read, are built exactly once.
const derived = new WeakMap<BuilderSnapshot, Derived>();

function derive(snapshot: BuilderSnapshot): Derived {
  const hit = derived.get(snapshot);
  if (hit !== undefined) return hit;
  const itemNames: Record<string, string> = {};
  const itemShortNames: Record<string, string> = {};
  for (const part of snapshot.parts) {
    itemNames[part.id] = part.name;
    itemShortNames[part.id] = part.shortName;
  }
  const weaponNames = new Map(snapshot.weapons.map((w) => [w.id, w.name]));
  const names = new Map<string, string>([
    ...Object.entries(snapshot.ingredientNames),
    ...weaponNames,
    ...Object.entries(itemNames),
  ]);
  const out: Derived = {
    // Every item a reachable slot allows is a part (the generator guarantees it), so the
    // part names are exactly the graph's `itemNames`.
    graph: { owners: snapshot.slots, itemNames, itemShortNames },
    names,
    parts: new Map(snapshot.parts.map((p) => [p.id, p])),
    weaponNames,
  };
  derived.set(snapshot, out);
  return out;
}

function pricedOffers(snapshot: BuilderSnapshot, id: string, prices: PriceTable | null) {
  const { names } = derive(snapshot);
  const offers = snapshot.offers[id];
  // The generator records offers for every weapon and part, even an empty list.
  if (offers === undefined) throw new Error(`builder-snapshot.json has no offers for ${id}`);
  return priceOffers(id, offers, prices, (key) => names.get(key));
}

/**
 * The part catalog: every snapshot part with its offers priced from `prices`, or with every
 * price unknown when `prices` is `null` (live prices loading or failed).
 */
export function snapshotPartCatalog(
  snapshot: BuilderSnapshot,
  prices: PriceTable | null,
): AttachablePart[] {
  return snapshot.parts.map((part) => ({
    ...part,
    buyFor: pricedOffers(snapshot, part.id, prices),
  }));
}

/**
 * One part with its offers priced, or `undefined` for an id the snapshot does not hold. For
 * callers that need a handful of parts, such as the Open Graph card, rather than all of them.
 */
export function snapshotPart(
  snapshot: BuilderSnapshot,
  prices: PriceTable | null,
  id: string,
): AttachablePart | undefined {
  const part = derive(snapshot).parts.get(id);
  return part === undefined ? undefined : { ...part, buyFor: pricedOffers(snapshot, id, prices) };
}

/**
 * Every snapshot part by id, unpriced: what checking a build against the game data needs (which
 * ids exist, and their conflict lists). Built once per snapshot.
 */
export function snapshotPartsById(snapshot: BuilderSnapshot): ReadonlyMap<string, SnapshotPart> {
  return derive(snapshot).parts;
}

/** The buildable weapons, each with its offers priced from `prices`. */
export function snapshotWeaponList(
  snapshot: BuilderSnapshot,
  prices: PriceTable | null,
): WeaponListItem[] {
  return snapshot.weapons.map((weapon) => ({
    ...weapon,
    buyFor: pricedOffers(snapshot, weapon.id, prices),
  }));
}

/** The slot graph, shared by every tree built from this snapshot. */
export function snapshotSlotGraph(snapshot: BuilderSnapshot): SlotGraph {
  return derive(snapshot).graph;
}

/**
 * One weapon's slot tree. Throws for an id that is not a buildable weapon in the snapshot,
 * which the Builder's error state already handles.
 */
export function snapshotWeaponTree(snapshot: BuilderSnapshot, weaponId: string): WeaponTree {
  const { graph, weaponNames } = derive(snapshot);
  const weaponName = weaponNames.get(weaponId);
  if (weaponName === undefined) throw new Error(`Weapon "${weaponId}" is not in the game data`);
  return { weaponId, weaponName, slots: expandSlots(graph, weaponId, ""), graph };
}

/**
 * Every item id whose price some snapshot offer depends on, sorted: the offers' own, and each
 * preset's flea listing.
 */
export function snapshotPriceIds(snapshot: BuilderSnapshot): string[] {
  const ids = new Set<string>();
  for (const [id, offers] of Object.entries(snapshot.offers)) {
    for (const priceId of offerPriceIds(id, offers)) ids.add(priceId);
  }
  for (const list of Object.values(snapshot.presets)) {
    for (const preset of list) if (preset.flea !== null) ids.add(preset.id);
  }
  return [...ids].sort();
}

/** A weapon preset with what it costs: every offer that sells the preset as a whole, priced. */
export interface PricedPreset extends WeaponPreset {
  /**
   * The weapon's trader offers and barters tagged with this preset, then the preset's own
   * flea listing. Read it with `presetAvailability`.
   */
  readonly buyFor: readonly BuyForEntry[];
}

/** Weapon id → its presets (default first), each with its offers priced from `prices`. */
export function snapshotWeaponPresets(
  snapshot: BuilderSnapshot,
  prices: PriceTable | null,
): Record<string, PricedPreset[]> {
  const out: Record<string, PricedPreset[]> = {};
  for (const [weaponId, list] of Object.entries(snapshot.presets)) {
    const weaponOffers = pricedOffers(snapshot, weaponId, prices);
    out[weaponId] = list.map(({ flea, ...preset }) => {
      const buyFor = weaponOffers.filter((entry) => entry.preset?.id === preset.id);
      if (flea !== null) {
        // The preset's own listing, priced by the same rule as any flea offer.
        buyFor.push(
          priceFleaOffer(
            preset.id,
            {
              __typename: "FleaMarket",
              normalizedName: "flea-market",
              minPlayerLevel: flea.minPlayerLevel,
            },
            prices,
          ),
        );
      }
      return { ...preset, buyFor };
    });
  }
  return out;
}

/**
 * Move a shared build's attachments whose item the snapshot does not hold into its `orphaned`
 * list: a part gone upstream since the build was shared, or a real item no weapon slot takes
 * (the snapshot carries only slot-reachable parts).
 *
 * Such an id cannot be shown, priced or counted, and silently dropping it would lose the
 * author's choice without a word. `orphaned` is where the Builder already lists what it could
 * not place, and a re-shared build carries it on. Ids already orphaned stay, without
 * duplicates, unless the list would pass {@link ORPHANED_CAP}, which every saved build must
 * respect: then the oldest are dropped, so the ids this load found are the ones kept. New ids
 * are added in slot-path order, so the result is the same for the same build.
 */
export function orphanUnknownParts(
  snapshot: BuilderSnapshot,
  attachments: Readonly<Record<string, string>>,
  orphaned: readonly string[],
): { attachments: Record<string, string>; orphaned: string[] } {
  const { parts } = derive(snapshot);
  const kept: Record<string, string> = {};
  const nextOrphaned = [...orphaned];
  const paths = Object.keys(attachments).sort((a, b) => Number(a > b) - Number(a < b));
  for (const path of paths) {
    const itemId = attachments[path]!;
    if (parts.has(itemId)) kept[path] = itemId;
    else if (!nextOrphaned.includes(itemId)) nextOrphaned.push(itemId);
  }
  return { attachments: kept, orphaned: nextOrphaned.slice(-ORPHANED_CAP) };
}
