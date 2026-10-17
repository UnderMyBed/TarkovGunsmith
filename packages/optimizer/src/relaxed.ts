import type { SlotDef } from "@tarkov/data";
import { combine, fits, prune, type FrontierContext, type Point } from "./frontier.js";
import type { Problem } from "./problem.js";

/**
 * What one node of the search rules out, on top of the problem itself. Each set only grows
 * down the search tree.
 */
export interface Constraints {
  /** Parts allowed nowhere. */
  readonly forbidden: ReadonlySet<string>;
  /** `${slotId}#${itemId}`: that part may not sit in that slot. */
  readonly slotForbidden: ReadonlySet<string>;
  /** Parts a path supplies whose cover count is enforced rather than assumed unlimited. */
  readonly tracked: ReadonlySet<string>;
  /** Parts allowed at most once in the build. */
  readonly limited: ReadonlySet<string>;
}

/** Fixed facts about the problem's graph, computed once per solve. */
export interface GraphIndex {
  /** Slot id → the part (or `""`, the weapon) that has the slot. */
  readonly slotOwner: ReadonlyMap<string, string>;
  /** Part id → the ids of the slots that take it. */
  readonly slotsAllowing: ReadonlyMap<string, readonly string[]>;
  /** Part and slot ids whose value depends on how the weapon is bought. */
  readonly pathSensitive: ReadonlySet<string>;
  /** Every pinned path and each of its ancestors: values there are not shared. */
  readonly pinPrefixes: ReadonlySet<string>;
}

/** Values already computed, by `p:<id>` (a part) or `s:<id>` (a slot). */
export interface Memo {
  readonly shared: Map<string, Point[]>;
  readonly perPath: readonly Map<string, Point[]>[];
}

export class SolveTimeout extends Error {
  override name = "SolveTimeout";
}

export function indexGraph(problem: Problem): GraphIndex {
  const slotOwner = new Map<string, string>();
  const slotsAllowing = new Map<string, string[]>();
  const add = (owner: string, slots: readonly SlotDef[]) => {
    for (const slot of slots) {
      slotOwner.set(slot.id, owner);
      for (const id of slot.allowedItemIds) {
        const list = slotsAllowing.get(id);
        if (list === undefined) slotsAllowing.set(id, [slot.id]);
        else list.push(slot.id);
      }
    }
  };
  add("", problem.rootSlots);
  for (const part of problem.parts.values()) add(part.id, part.slots);
  const index = {
    slotOwner,
    slotsAllowing,
    pathSensitive: new Set<string>(),
    pinPrefixes: new Set<string>(),
  };
  const covered = new Set<string>();
  for (const path of problem.paths) for (const id of path.covers.keys()) covered.add(id);
  for (const id of ancestorsOf(index, covered, [])) index.pathSensitive.add(id);
  for (const path of problem.pins.keys()) {
    const segments = path.split("/");
    for (let i = 1; i <= segments.length; i++)
      index.pinPrefixes.add(segments.slice(0, i).join("/"));
  }
  return index;
}

/**
 * The given parts and slots, every slot that takes one of the parts, and every part and slot
 * above them: everything whose value can change when they do.
 */
export function ancestorsOf(
  index: Pick<GraphIndex, "slotOwner" | "slotsAllowing">,
  parts: Iterable<string>,
  slots: Iterable<string>,
): Set<string> {
  const out = new Set<string>();
  const queue: string[] = [];
  const addSlot = (slot: string) => {
    if (out.has(slot)) return;
    out.add(slot);
    const owner = index.slotOwner.get(slot);
    if (owner !== undefined && owner !== "" && !out.has(owner)) {
      out.add(owner);
      queue.push(owner);
    }
  };
  for (const id of parts) {
    out.add(id);
    queue.push(id);
  }
  for (const slot of slots) addSlot(slot);
  while (queue.length > 0)
    for (const slot of index.slotsAllowing.get(queue.pop()!) ?? []) addSlot(slot);
  return out;
}

export function freshMemo(problem: Problem): Memo {
  return { shared: new Map(), perPath: problem.paths.map(() => new Map()) };
}

/** `memo` without the values that depend on the given parts and slots. */
export function deriveMemo(
  memo: Memo,
  index: GraphIndex,
  parts: Iterable<string>,
  slots: Iterable<string>,
): Memo {
  const stale = ancestorsOf(index, parts, slots);
  const keep = (table: Map<string, Point[]>) => {
    const out = new Map<string, Point[]>();
    for (const [key, value] of table) if (!stale.has(key.slice(2))) out.set(key, value);
    return out;
  };
  return { shared: keep(memo.shared), perPath: memo.perPath.map(keep) };
}

const EMPTY_SLOT: Point = {
  stat: 0,
  price: 0,
  count: 0,
  key: "",
  counts: null,
  how: { t: "slot", itemId: null, inner: null },
};

/**
 * The best builds on one weapon path under `cons`, ignoring conflicts and cover counts the
 * search has not yet had to enforce: one point per dispersion key with no budget, the
 * (price, stat) frontier per key with one. Required slots are never left empty; a slot nothing
 * can fill makes its part, and so its whole branch, impossible.
 *
 * Values are memoised per part and per slot definition, so a part reached by many paths in the
 * slot graph is solved once. That relies on the graph having no cycles, which the live data
 * does not; a cycle throws rather than looping.
 */
export function relaxedBest(
  problem: Problem,
  index: GraphIndex,
  cons: Constraints,
  pathIndex: number,
  memo: Memo,
  deadline: number,
): Point[] {
  const path = problem.paths[pathIndex]!;
  const ctx: FrontierContext = {
    budget: problem.budget,
    path,
    limited: cons.limited,
    parts: problem.parts,
  };
  const table = (id: string) =>
    index.pathSensitive.has(id) ? memo.perPath[pathIndex]! : memo.shared;
  const covered = (id: string) => (path.covers.get(id) ?? 0) > 0;
  const inProgress = new Set<string>();

  const partValue = (id: string, at: string, pinned: boolean): Point[] => {
    const own = index.pinPrefixes.has(at);
    if (!own) {
      const hit = table(id).get(`p:${id}`);
      if (hit !== undefined) return hit;
    }
    if (Date.now() > deadline) throw new SolveTimeout();
    if (inProgress.has(id)) throw new Error(`the slot graph has a cycle through ${id}`);
    inProgress.add(id);
    const part = problem.parts.get(id)!;
    const counted = cons.limited.has(id) || (cons.tracked.has(id) && covered(id));
    const self: Point = {
      stat: part.stat,
      price: covered(id) ? 0 : part.price,
      count: 1,
      key: part.key,
      counts: counted
        ? new Map([
            [id, pinned ? 0 : 1],
            [`${id}!`, 1],
          ])
        : null,
      how: { t: "none" },
    };
    let value: Point[] = fits(self.price, problem.budget) ? [self] : [];
    for (const slot of part.slots) {
      if (value.length === 0) break;
      value = combine(value, slotValue(slot, `${at}/${slot.nameId}`), ctx);
    }
    inProgress.delete(id);
    if (!own) table(id).set(`p:${id}`, value);
    return value;
  };

  const slotValue = (slot: SlotDef, at: string): Point[] => {
    const own = index.pinPrefixes.has(at);
    if (!own) {
      const hit = table(slot.id).get(`s:${slot.id}`);
      if (hit !== undefined) return hit;
    }
    const allowed = (id: string) =>
      !cons.forbidden.has(id) && !cons.slotForbidden.has(`${slot.id}#${id}`);
    const options: Point[] = [];
    const take = (id: string, pinned: boolean) => {
      for (const inner of partValue(id, at, pinned)) {
        options.push({ ...inner, how: { t: "slot", itemId: id, inner } });
      }
    };
    const pin = problem.pins.get(at);
    if (pin !== undefined && pinHonourable(problem, slot, pin)) {
      if (pin === null) options.push(EMPTY_SLOT);
      else if (allowed(pin)) take(pin, true);
    } else {
      if (!slot.required) options.push(EMPTY_SLOT);
      for (const id of slot.allowedItemIds) {
        const part = problem.parts.get(id);
        if (part === undefined || !(part.available || covered(id)) || !allowed(id)) continue;
        take(id, false);
      }
    }
    const value = prune(options, problem.budget);
    if (!own) table(slot.id).set(`s:${slot.id}`, value);
    return value;
  };

  const root: Point = {
    stat: 0,
    price: path.price,
    count: 0,
    key: "",
    counts: null,
    how: { t: "none" },
  };
  let value: Point[] = fits(root.price, problem.budget) ? [root] : [];
  for (const slot of problem.rootSlots) {
    if (value.length === 0) break;
    value = combine(value, slotValue(slot, slot.nameId), ctx);
  }
  return value;
}

/**
 * Whether a pin can be kept wherever its path exists: a part the slot takes and the catalog
 * holds, or empty in a slot that may be empty.
 */
export function pinHonourable(problem: Problem, slot: SlotDef, pin: string | null): boolean {
  if (pin === null) return !slot.required;
  return slot.allowedItemIds.includes(pin) && problem.parts.has(pin);
}

/** The attachments a root point chose, slot path → part id. */
export function attachmentsOf(problem: Problem, root: Point): Record<string, string> {
  const attachments: Record<string, string> = {};
  const walk = (slots: readonly SlotDef[], base: string, chain: Point) => {
    const picks: Point[] = [];
    const stack = [chain];
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (x.how.t === "sum") stack.push(x.how.b, x.how.a);
      else if (x.how.t === "slot") picks.push(x);
    }
    slots.forEach((slot, i) => {
      const how = picks[i]!.how;
      if (how.t !== "slot" || how.itemId === null) return;
      const at = base === "" ? slot.nameId : `${base}/${slot.nameId}`;
      attachments[at] = how.itemId;
      walk(problem.parts.get(how.itemId)!.slots, at, how.inner!);
    });
  };
  walk(problem.rootSlots, "", root);
  return attachments;
}
