import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";
import { buildSlotGraph, selectWeaponTree, type SlotGraph, type WeaponTree } from "./slot-graph.js";

export type {
  SlotCategory,
  SlotDef,
  SlotGraph,
  SlotNode,
  SlotOwner,
  WeaponTree,
} from "./slot-graph.js";

// One graph per items document. The client caches the document object per TTL, so every tree
// fetched from the same document (both sides of a comparison, say) shares one graph.
const graphs = new WeakMap<object, SlotGraph>();

/**
 * The slot graph for an items document, built once per document object and shared by every
 * caller holding the same document.
 */
export function slotGraphFor(doc: ItemsDocument): SlotGraph {
  let graph = graphs.get(doc);
  if (graph === undefined) {
    graph = buildSlotGraph(doc);
    graphs.set(doc, graph);
  }
  return graph;
}

/**
 * Fetch one weapon's slot tree: its own slots, plus the shared graph deeper slots expand from.
 * A thin wrapper over the pure {@link selectWeaponTree}. Throws for a missing or non-weapon id.
 */
export async function fetchWeaponTree(
  client: TarkovJsonClient,
  weaponId: string,
): Promise<WeaponTree> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  return selectWeaponTree(doc, weaponId, slotGraphFor(doc));
}
