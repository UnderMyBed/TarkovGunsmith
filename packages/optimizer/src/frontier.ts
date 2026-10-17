import type { SolverPart, SolverPath } from "./problem.js";
import { UNKNOWN_PRICE } from "./problem.js";

/**
 * One way to fill part of the tree: its summed objective figure, price and part count, the
 * dispersion key it carries (max-accuracy), the copies it holds of counted parts, and how to
 * read back which parts it chose.
 */
export interface Point {
  readonly stat: number;
  readonly price: number;
  readonly count: number;
  /** `""` until a part that sets the dispersion is in it. */
  readonly key: string;
  /**
   * Copies of counted parts: `id` → copies nobody pinned, `id!` → all copies. Capped at the
   * path's cover for that part, since every copy past the cover is paid for as it is added.
   */
  readonly counts: ReadonlyMap<string, number> | null;
  readonly how: How;
}

export type How =
  | { readonly t: "none" }
  | { readonly t: "sum"; readonly a: Point; readonly b: Point }
  | { readonly t: "slot"; readonly itemId: string | null; readonly inner: Point | null };

/** What combining two points needs to know beyond the points. */
export interface FrontierContext {
  readonly budget: number | undefined;
  readonly path: SolverPath;
  /** Parts allowed at most once in the build. */
  readonly limited: ReadonlySet<string>;
  readonly parts: ReadonlyMap<string, SolverPart>;
}

/** Whether a price is known and inside the budget. */
export function fits(price: number, budget: number | undefined): boolean {
  return budget === undefined || (price <= budget && price < UNKNOWN_PRICE);
}

const groupKey = (x: Point): string =>
  x.counts === null
    ? x.key
    : `${x.key}|${[...x.counts]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, n]) => `${id}:${n}`)
        .join(",")}`;

/**
 * The points worth keeping, from points that all fit the budget. Points that differ in key or
 * counts can never stand in for each other. Within a group: with no budget, only the best by
 * stat, then price, then count; with a budget, every point no cheaper point matches on stat —
 * the (price, stat) Pareto frontier.
 */
export function prune(points: readonly Point[], budget: number | undefined): Point[] {
  const groups = new Map<string, Point[]>();
  for (const x of points) {
    const g = groupKey(x);
    const list = groups.get(g);
    if (list === undefined) groups.set(g, [x]);
    else list.push(x);
  }
  const out: Point[] = [];
  for (const list of groups.values()) {
    if (budget === undefined) {
      let best = list[0]!;
      for (const x of list) {
        if (
          x.stat < best.stat ||
          (x.stat === best.stat &&
            (x.price < best.price || (x.price === best.price && x.count < best.count)))
        ) {
          best = x;
        }
      }
      out.push(best);
      continue;
    }
    list.sort((a, b) => a.price - b.price || a.stat - b.stat || a.count - b.count);
    let bestStat = Number.POSITIVE_INFINITY;
    for (const x of list) {
      if (x.stat < bestStat) {
        out.push(x);
        bestStat = x.stat;
      }
    }
  }
  return out;
}

/**
 * Every pairing of a point from `as` with one from `bs`, pruned: the two halves of the tree
 * filled together. A pairing that puts a second dispersion part on the build throws, because
 * `weaponSpec` and the MOA objective both assume one; `pnpm verify:upstream` checks no weapon
 * can mount two barrels.
 */
export function combine(as: readonly Point[], bs: readonly Point[], ctx: FrontierContext): Point[] {
  const out: Point[] = [];
  for (const a of as) {
    for (const b of bs) {
      if (a.key !== "" && b.key !== "") {
        throw new Error(`two parts set the dispersion of one build: ${a.key} and ${b.key}`);
      }
      const merged = mergeCounts(a, b, ctx);
      if (merged === null) continue;
      const price = a.price + b.price + merged.extra;
      if (!fits(price, ctx.budget)) continue;
      out.push({
        stat: a.stat + b.stat,
        price,
        count: a.count + b.count,
        key: a.key === "" ? b.key : a.key,
        counts: merged.counts,
        how: { t: "sum", a, b },
      });
    }
  }
  return prune(out, ctx.budget);
}

/**
 * The counted copies of `a` and `b` together, and what the copies past a path's cover cost,
 * or `null` when they cannot be together: a limited part twice, or an unpinned copy of a
 * part nobody sells past what the path supplies.
 */
function mergeCounts(
  a: Point,
  b: Point,
  ctx: FrontierContext,
): { counts: ReadonlyMap<string, number> | null; extra: number } | null {
  if (b.counts === null) return { counts: a.counts, extra: 0 };
  if (a.counts === null) return { counts: b.counts, extra: 0 };
  const counts = new Map(a.counts);
  let extra = 0;
  for (const [id, bUnpinned] of b.counts) {
    if (id.endsWith("!")) continue;
    const unpinned = (counts.get(id) ?? 0) + bUnpinned;
    const all = (counts.get(`${id}!`) ?? 0) + b.counts.get(`${id}!`)!;
    if (ctx.limited.has(id) && all > 1) return null;
    const cover = ctx.path.covers.get(id) ?? 0;
    if (cover > 0) {
      const part = ctx.parts.get(id)!;
      if (unpinned > cover && !part.available) return null;
      // Each copy past the cover is bought: at its price, or at an unknown one for a pinned
      // copy of a part nobody sells.
      if (all > cover) extra += (all - cover) * (part.available ? part.price : UNKNOWN_PRICE);
      counts.set(id, Math.min(unpinned, cover));
      counts.set(`${id}!`, Math.min(all, cover));
    } else {
      // Not supplied on this path: each copy was priced where it was placed.
      counts.set(id, unpinned);
      counts.set(`${id}!`, all);
    }
  }
  return { counts, extra };
}
