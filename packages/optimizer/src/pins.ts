import type { SlotDef, SlotGraph } from "@tarkov/data";
import type { DroppedPin, PinReport } from "./types.js";

/**
 * Which pins a build keeps and why it drops the rest. A pin holds wherever its path exists, so
 * it is dropped only for a reason the build can show: the path is not on it, the slot there
 * does not take the part, the part is unknown, or the slot is required and the pin asked for it
 * empty.
 */
export function pinReport(
  graph: SlotGraph,
  weaponId: string,
  attachments: Readonly<Record<string, string>>,
  pins: ReadonlyMap<string, string | null>,
  known: (id: string) => boolean,
): PinReport {
  const slots = new Map<string, SlotDef>();
  const walk = (owner: string, base: string) => {
    for (const slot of graph.owners[owner]?.slots ?? []) {
      const at = base === "" ? slot.nameId : `${base}/${slot.nameId}`;
      slots.set(at, slot);
      const id = attachments[at];
      if (id !== undefined) walk(id, at);
    }
  };
  walk(weaponId, "");

  const honoured: string[] = [];
  const dropped: DroppedPin[] = [];
  for (const [path, itemId] of [...pins].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const slot = slots.get(path);
    const drop = (reason: DroppedPin["reason"]) => dropped.push({ path, itemId, reason });
    if (itemId !== null && !known(itemId)) drop("unknown-item");
    else if (slot === undefined) drop("absent");
    else if (itemId === null && slot.required) drop("required");
    else if (itemId !== null && !slot.allowedItemIds.includes(itemId)) drop("not-allowed");
    else honoured.push(path);
  }
  return { honoured, dropped };
}
