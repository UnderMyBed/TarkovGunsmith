import type { AttachablePart, WeaponTree } from "@tarkov/data";
import { STAT_SCALE, type Problem, type SolverPart } from "./problem.js";
import { search, type Found } from "./search.js";

/**
 * {@link search}, made exact for max-accuracy when some build's MOA would be 0 whatever its
 * accuracy modifiers: a dispersion part (or the bare weapon) with no `centerOfImpact`. Such a
 * build beats every other, and among them only price and part count matter — an order the
 * search cannot see while a part's key is still unknown below it. So it first asks, with every
 * figure zeroed, whether any build carries a zero key; if one does, the cheapest such is the
 * answer. If none does, no zero key can appear in a valid build, and they are rated as any other.
 * No live weapon has such a build; the property tests cover the path.
 */
export function solve(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
): Found | null {
  const multiplier = problem.multiplier;
  if (multiplier === undefined) return search(problem, tree, catalog, deadline);
  const keys = new Set([""]);
  for (const part of problem.parts.values()) if (part.key !== "") keys.add(part.key);
  const zero = new Set([...keys].filter((key) => multiplier(key) === 0));
  if (zero.size === 0) return search(problem, tree, catalog, deadline);

  const flat = new Map<string, SolverPart>();
  for (const [id, part] of problem.parts) flat.set(id, { ...part, stat: 0 });
  const first = search(
    { ...problem, parts: flat, rate: (key) => (zero.has(key) ? 0 : 1) },
    tree,
    catalog,
    deadline,
  );
  if (first !== null && zero.has(first.point.key)) {
    let stat = 0;
    for (const id of Object.values(first.attachments)) stat += problem.parts.get(id)!.stat;
    return { ...first, point: { ...first.point, stat } };
  }
  return search(
    {
      ...problem,
      rate: (key, stat) => (zero.has(key) ? 1 : multiplier(key)) * (1 + stat / STAT_SCALE),
    },
    tree,
    catalog,
    deadline,
  );
}
