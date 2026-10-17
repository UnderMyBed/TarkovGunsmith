/**
 * Pure tree-walking diff. Given two (tree, attachments) pairs, produces a
 * map keyed by slot path → one of four statuses. The map includes every
 * path present on either side; paths absent from both are omitted.
 *
 * The caller passes the `WeaponTree` that `useWeaponTree` returns plus the
 * `Record<SlotPath, ItemId>` map that the Builder maintains. Each side's
 * paths are the slots that side currently shows (`visibleSlots`): its
 * weapon's slots plus the slots of whatever is attached. The function does
 * not require the two trees to be identical — compare only runs on matched
 * paths. Missing-on-one-side slots fall out as `left-only` / `right-only`
 * depending on which side has the attachment.
 */

import { visibleSlots, type WeaponTree } from "./queries/slot-graph.js";

export type SlotDiffStatus = "equal" | "differs" | "left-only" | "right-only";

export interface SlotDiffInput {
  /** `null` while the side's tree is still loading: only its attachment keys count then. */
  tree: WeaponTree | null;
  attachments: Readonly<Record<string, string>>;
}

export type SlotDiffMap = ReadonlyMap<string, SlotDiffStatus>;

function collectPaths(input: SlotDiffInput | null, acc: Set<string>): void {
  if (!input?.tree) return;
  for (const slot of visibleSlots(input.tree, input.attachments)) acc.add(slot.path);
}

export function slotDiff(left: SlotDiffInput | null, right: SlotDiffInput | null): SlotDiffMap {
  const paths = new Set<string>();
  collectPaths(left, paths);
  collectPaths(right, paths);
  for (const p of Object.keys(left?.attachments ?? {})) paths.add(p);
  for (const p of Object.keys(right?.attachments ?? {})) paths.add(p);

  const out = new Map<string, SlotDiffStatus>();
  for (const path of paths) {
    const l = left?.attachments[path];
    const r = right?.attachments[path];
    if (l === undefined && r === undefined) {
      out.set(path, "equal");
      continue;
    }
    if (l === undefined) {
      out.set(path, "right-only");
      continue;
    }
    if (r === undefined) {
      out.set(path, "left-only");
      continue;
    }
    out.set(path, l === r ? "equal" : "differs");
  }
  return out;
}
