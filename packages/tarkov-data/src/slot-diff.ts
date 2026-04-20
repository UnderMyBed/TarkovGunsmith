/**
 * Pure tree-walking diff. Given two (tree, attachments) pairs, produces a
 * map keyed by slot path → one of four statuses. The map includes every
 * path present on either side; paths absent from both are omitted.
 *
 * The caller passes the `SlotNode[]` arrays that `useWeaponTree` returns
 * plus the `Record<SlotPath, ItemId>` map that the Builder maintains.
 * The function does not require the two trees to be identical — compare
 * only runs on matched paths. Missing-on-one-side slots fall out as
 * `left-only` / `right-only` depending on which side has the attachment.
 */

export type SlotDiffStatus = "equal" | "differs" | "left-only" | "right-only";

interface SlotNodeLike {
  nameId: string;
  path: string;
  children: readonly SlotNodeLike[];
}

export interface SlotDiffInput {
  tree: readonly SlotNodeLike[];
  attachments: Readonly<Record<string, string>>;
}

export type SlotDiffMap = ReadonlyMap<string, SlotDiffStatus>;

function collectPaths(tree: readonly SlotNodeLike[] | undefined, acc: Set<string>): void {
  if (!tree) return;
  for (const node of tree) {
    acc.add(node.path);
    collectPaths(node.children, acc);
  }
}

export function slotDiff(left: SlotDiffInput | null, right: SlotDiffInput | null): SlotDiffMap {
  const paths = new Set<string>();
  collectPaths(left?.tree, paths);
  collectPaths(right?.tree, paths);
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
