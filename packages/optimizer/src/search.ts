import { resolveBuild, type AttachablePart, type WeaponTree } from "@tarkov/data";
import type { Point } from "./frontier.js";
import type { Problem } from "./problem.js";
import {
  attachmentsOf,
  deriveMemo,
  freshMemo,
  indexGraph,
  relaxedBest,
  type Constraints,
  type Memo,
} from "./relaxed.js";

export interface Found {
  readonly point: Point;
  readonly pathIndex: number;
  readonly attachments: Readonly<Record<string, string>>;
}

interface Node {
  readonly cons: Constraints;
  memo: Memo | null;
  readonly best: Point;
  readonly pathIndex: number;
}

/** Real objective figure, then price, then part count. MOA ties are compared with a tolerance. */
export function compareRoots(problem: Problem, a: Point, b: Point): number {
  const ra = problem.rate(a.key, a.stat);
  const rb = problem.rate(b.key, b.stat);
  // MOA is a product of floats: two barrels that tie exactly can differ in the last bit.
  if (Math.abs(ra - rb) > 1e-9 * Math.max(1, Math.abs(ra), Math.abs(rb))) return ra < rb ? -1 : 1;
  if (a.price !== b.price) return a.price < b.price ? -1 : 1;
  return a.count - b.count;
}

/**
 * The best build, exactly: best figure, then cheapest, then fewest parts. `null` when no
 * build is possible.
 *
 * Each node of a best-first search holds a set of constraints and the best build that
 * {@link relaxedBest} finds under them on any weapon path — a build that may break a part
 * conflict, or use more copies of a preset's part than the preset supplies, because the DP
 * does not see either. That relaxed best is a lower bound for every build the node allows. The
 * node with the lowest bound is taken next; if its build breaks nothing, no other node can beat
 * it, and it is the answer. Otherwise the node is split so that every valid build it allowed
 * stays allowed in some child and the broken build in none:
 *
 * - two parts clash (by `conflictingItems`, or one blocking the other's slot): pick the one
 *   with more conflicts, x. Either x is absent, or x may stay and every part it clashes with
 *   is absent and every slot it blocks holds nothing but x;
 * - two copies of one part clash: at most one copy;
 * - a part blocks the slot one of its own copies sits in: either that copy is not there, or
 *   there is only one copy;
 * - a preset's part is used more often than the preset supplies: count its copies from then on.
 *
 * Conflicts are read with `@tarkov/data`'s `resolveBuild`, the rule the Builder flags builds by.
 */
export function search(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
): Found | null {
  const index = indexGraph(problem);
  const reverse = new Map<string, string[]>();
  for (const part of problem.parts.values()) {
    for (const other of part.conflictingItems) {
      const list = reverse.get(other);
      if (list === undefined) reverse.set(other, [part.id]);
      else list.push(part.id);
    }
  }
  // Only placed parts are asked about, and every placed part is in the problem.
  const partnersOf = (id: string) =>
    new Set([...problem.parts.get(id)!.conflictingItems, ...(reverse.get(id) ?? [])]);
  const weight = (id: string) =>
    partnersOf(id).size + problem.parts.get(id)!.conflictingSlotIds.length;
  const slotAllowed = new Map<string, readonly string[]>();
  for (const slot of problem.rootSlots) slotAllowed.set(slot.id, slot.allowedItemIds);
  for (const part of problem.parts.values()) {
    for (const slot of part.slots) slotAllowed.set(slot.id, slot.allowedItemIds);
  }

  const open: Node[] = [];
  const push = (cons: Constraints, memo: Memo) => {
    let best: Point | null = null;
    let bestPath = 0;
    for (let i = 0; i < problem.paths.length; i++) {
      for (const point of relaxedBest(problem, index, cons, i, memo, deadline)) {
        if (best === null || compareRoots(problem, point, best) < 0) {
          best = point;
          bestPath = i;
        }
      }
    }
    if (best !== null) open.push({ cons, memo, best, pathIndex: bestPath });
  };
  const child = (node: Node, add: { [K in keyof Constraints]?: readonly string[] }) => {
    const grow = (k: keyof Constraints) => new Set([...node.cons[k], ...(add[k] ?? [])]);
    const cons: Constraints = {
      forbidden: grow("forbidden"),
      slotForbidden: grow("slotForbidden"),
      tracked: grow("tracked"),
      limited: grow("limited"),
    };
    const parts = [...(add.forbidden ?? []), ...(add.tracked ?? []), ...(add.limited ?? [])];
    const slots = (add.slotForbidden ?? []).map((entry) => entry.split("#")[0]!);
    push(cons, deriveMemo(node.memo!, index, parts, slots));
  };

  push(
    { forbidden: new Set(), slotForbidden: new Set(), tracked: new Set(), limited: new Set() },
    freshMemo(problem),
  );
  while (open.length > 0) {
    let at = 0;
    for (let i = 1; i < open.length; i++) {
      if (compareRoots(problem, open[i]!.best, open[at]!.best) < 0) at = i;
    }
    const node = open.splice(at, 1)[0]!;
    problem.tick?.();
    const attachments = attachmentsOf(problem, node.best);
    const clash = resolveBuild(tree, attachments, catalog).conflicts[0];
    if (clash === undefined) {
      const path = problem.paths[node.pathIndex]!;
      const copies = new Map<string, number>();
      for (const id of Object.values(attachments)) copies.set(id, (copies.get(id) ?? 0) + 1);
      const over = [...path.covers]
        .filter(([id, n]) => (copies.get(id) ?? 0) > n && !node.cons.tracked.has(id))
        .map(([id]) => id);
      if (over.length === 0) return { point: node.best, pathIndex: node.pathIndex, attachments };
      child(node, { tracked: over });
    } else if (clash.a.itemId === clash.b.itemId) {
      const id = clash.a.itemId;
      if (clash.kind === "slot") child(node, { slotForbidden: [`${clash.slotId!}#${id}`] });
      child(node, { limited: [id] });
    } else {
      let x = clash.a.itemId;
      if (clash.kind === "item" && weight(clash.b.itemId) > weight(x)) x = clash.b.itemId;
      child(node, { forbidden: [x] });
      const slotForbidden: string[] = [];
      for (const slot of problem.parts.get(x)!.conflictingSlotIds) {
        for (const other of slotAllowed.get(slot) ?? []) {
          if (other !== x) slotForbidden.push(`${slot}#${other}`);
        }
      }
      child(node, { forbidden: [...partnersOf(x)].filter((y) => y !== x), slotForbidden });
    }
    node.memo = null;
  }
  return null;
}
