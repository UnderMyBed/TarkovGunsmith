import {
  buildSlotGraph,
  selectWeaponTree,
  type AttachablePart,
  type SlotDef,
  type WeaponTree,
} from "@tarkov/data";
import {
  STAT_SCALE,
  UNKNOWN_PRICE,
  type Problem,
  type SolverPart,
  type SolverPath,
} from "../problem.js";

/**
 * Random solver problems, and a brute-force oracle that enumerates every build of one. The
 * oracle shares nothing with the solver but the problem itself: it lists every way to fill the
 * slots, applies the conflict rule pairwise, keeps the pins, and prices each build on each
 * weapon path by handing out the path's free copies one at a time.
 */

/** mulberry32: small, fast, and good enough to spread cases over the generator's choices. */
export function prng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomCase {
  readonly problem: Problem;
  readonly tree: WeaponTree;
  readonly catalog: ReadonlyMap<string, AttachablePart>;
  readonly accuracy: boolean;
}

interface RawSlot {
  id: string;
  nameId: string;
  name: string;
  required: boolean;
  filters: { allowedCategories: never[]; allowedItems: string[] };
}

/** A part record holding only what `resolveBuild` reads; the solver reads the `Problem`. */
function catalogPart(id: string, conflictingItems: string[], conflictingSlotIds: string[]) {
  const part: AttachablePart = {
    id,
    name: id,
    shortName: id,
    iconLink: `https://example.com/${id}.png`,
    weight: 0,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics: 0,
      recoilModifier: 0,
      accuracyModifier: 0,
      velocity: 0,
    },
    conflictingItems,
    conflictingSlotIds,
    buyFor: null,
  };
  return part;
}

/**
 * A problem of 6–13 parts in a random slot DAG: required and optional slots, parts that hold
 * slots of their own, upstream-style one-directional and self-listed conflicts, blocked slots,
 * parts nobody sells and parts with no known price, presets that supply copies, pins (some on
 * paths no build has, some for parts the slot does not take or the catalog lacks), budgets,
 * and for max-accuracy dispersion keys whose MOA multiplier is sometimes 0.
 */
export function randomCase(rnd: () => number): RandomCase {
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const accuracy = rnd() < 0.3;
  const n = int(6, 13);
  const ids = Array.from({ length: n }, (_, i) => `i${i}`);
  // Dispersion parts sit only in the root's barrel slot and hold no other dispersion part, so
  // no build has two (as `pnpm verify:upstream` checks of the live data).
  const barrels = new Set(accuracy || rnd() < 0.3 ? ids.slice(0, int(1, 3)) : []);
  let slotN = 0;
  const raw: Record<string, unknown> = {};
  const slotIds: string[] = [];
  const rawSlot = (nameId: string, allowed: string[]): RawSlot => {
    const id = `s${slotN++}`;
    slotIds.push(id);
    return {
      id,
      nameId,
      name: nameId,
      required: rnd() < 0.35,
      filters: { allowedCategories: [], allowedItems: [...new Set(allowed)] },
    };
  };
  for (let i = 0; i < n; i++) {
    const later = ids.slice(i + 1).filter((x) => !barrels.has(x));
    const count = later.length === 0 ? 0 : int(0, i < 3 ? 2 : 1);
    const slots = Array.from({ length: count }, (_, k) =>
      rawSlot(
        `m${k}`,
        Array.from({ length: int(1, 3) }, () => pick(later)),
      ),
    );
    raw[ids[i]!] = {
      id: ids[i],
      name: ids[i],
      properties: { propertiesType: "ItemPropertiesWeaponMod", slots },
    };
  }
  const rootSlots: RawSlot[] = [];
  if (barrels.size > 0) rootSlots.push(rawSlot("barrel", [...barrels]));
  const plain = ids.filter((x) => !barrels.has(x));
  for (let k = int(1, 3); k > 0; k--) {
    rootSlots.push(
      rawSlot(
        `r${k}`,
        Array.from({ length: int(1, 4) }, () => pick(plain)),
      ),
    );
  }
  raw.w = {
    id: "w",
    name: "w",
    properties: { propertiesType: "ItemPropertiesWeapon", slots: rootSlots },
  };
  const doc = { items: raw };
  const graph = buildSlotGraph(doc);
  const tree = selectWeaponTree(doc, "w", graph);

  const parts = new Map<string, SolverPart>();
  const catalog = new Map<string, AttachablePart>();
  for (const id of ids) {
    const sold = rnd() >= 0.15;
    const conflictingItems = ids.filter((o) => o !== id && rnd() < 0.12);
    if (rnd() < 0.03) conflictingItems.push(id); // upstream lists some parts against themselves
    const conflictingSlotIds = slotIds.filter(() => rnd() < 0.05);
    // Upstream also names slots of other weapons.
    if (rnd() < 0.05) conflictingSlotIds.push("elsewhere");
    parts.set(id, {
      id,
      slots: graph.owners[id]?.slots ?? [],
      stat: int(-6, 6) * 10_000,
      key: accuracy && barrels.has(id) ? id : "",
      price: !sold || rnd() < 0.1 ? UNKNOWN_PRICE : int(0, 9),
      available: sold,
      conflictingItems,
      conflictingSlotIds,
    });
    catalog.set(id, catalogPart(id, conflictingItems, conflictingSlotIds));
  }

  const paths: SolverPath[] = [
    { presetId: null, price: rnd() < 0.15 ? UNKNOWN_PRICE : int(0, 20), covers: new Map() },
  ];
  for (let k = int(0, 2); k > 0; k--) {
    const covers = new Map<string, number>();
    for (const id of ids) if (rnd() < 0.3) covers.set(id, int(1, 2));
    paths.push({ presetId: `p${k}`, price: int(0, 40), covers });
  }

  const visible: [string, SlotDef][] = [];
  const walk = (slots: readonly SlotDef[], base: string, depth: number) => {
    if (depth > 4) return;
    for (const slot of slots) {
      const at = base === "" ? slot.nameId : `${base}/${slot.nameId}`;
      visible.push([at, slot]);
      for (const id of slot.allowedItemIds) walk(parts.get(id)!.slots, at, depth + 1);
    }
  };
  const root = graph.owners.w!.slots;
  walk(root, "", 0);
  const pins = new Map<string, string | null>();
  for (let k = int(0, 2); k > 0; k--) {
    const [at, slot] = pick(visible);
    const r = rnd();
    pins.set(
      at,
      r < 0.2 ? null : r < 0.8 ? pick(slot.allowedItemIds) : r < 0.95 ? pick(ids) : "ghost",
    );
  }

  const budget = rnd() < 0.5 ? int(0, 60) : undefined;
  if (!accuracy)
    return {
      problem: { rootSlots: root, parts, paths, pins, budget, rate: (_k, s) => s },
      tree,
      catalog,
      accuracy,
    };
  const multipliers = new Map<string, number>();
  const multiplier = (key: string) => {
    let m = multipliers.get(key);
    if (m === undefined) {
      m = rnd() < 0.1 ? 0 : int(1, 9) / 3;
      multipliers.set(key, m);
    }
    return m;
  };
  // Fix every key's multiplier now, so the oracle and the solver see the same ones.
  for (const key of ["", ...barrels]) multiplier(key);
  return {
    problem: {
      rootSlots: root,
      parts,
      paths,
      pins,
      budget,
      multiplier,
      rate: (key, stat) => multiplier(key) * (1 + stat / STAT_SCALE),
    },
    tree,
    catalog,
    accuracy,
  };
}

export interface Score {
  readonly rating: number;
  readonly price: number;
  readonly count: number;
}

/** Best rating (with the solver's MOA tolerance), then price, then part count. */
export function compareScores(a: Score, b: Score): number {
  const tolerance = 1e-9 * Math.max(1, Math.abs(a.rating), Math.abs(b.rating));
  if (Math.abs(a.rating - b.rating) > tolerance) return a.rating - b.rating;
  if (a.price !== b.price) return a.price - b.price;
  return a.count - b.count;
}

interface Placed {
  readonly path: string;
  readonly id: string;
  readonly slotId: string;
}

/**
 * A build's score, or `null` when it is not valid: two of its parts clash, it breaks a pin it
 * can keep, or no weapon path can supply it within the budget.
 */
export function scoreBuild(problem: Problem, build: readonly Placed[]): Score | null {
  const part = (id: string) => problem.parts.get(id)!;
  for (let i = 0; i < build.length; i++) {
    for (let j = i + 1; j < build.length; j++) {
      const x = build[i]!;
      const y = build[j]!;
      const X = part(x.id);
      const Y = part(y.id);
      if (X.conflictingItems.includes(y.id) || Y.conflictingItems.includes(x.id)) return null;
      if (X.conflictingSlotIds.includes(y.slotId) || Y.conflictingSlotIds.includes(x.slotId)) {
        return null;
      }
    }
  }
  const at = new Map(build.map((x) => [x.path, x.id]));
  const exists = new Map<string, SlotDef>();
  const walk = (slots: readonly SlotDef[], base: string) => {
    for (const slot of slots) {
      const path = base === "" ? slot.nameId : `${base}/${slot.nameId}`;
      exists.set(path, slot);
      const id = at.get(path);
      if (id !== undefined) walk(part(id).slots, path);
    }
  };
  walk(problem.rootSlots, "");
  const pinnedAt = new Set<string>();
  for (const [path, pin] of problem.pins) {
    const slot = exists.get(path);
    if (slot === undefined) continue;
    if (pin === null) {
      if (!slot.required && at.has(path)) return null;
      continue;
    }
    if (!slot.allowedItemIds.includes(pin) || !problem.parts.has(pin)) continue;
    if (at.get(path) !== pin) return null;
    pinnedAt.add(path);
  }
  let stat = 0;
  let key = "";
  for (const x of build) {
    stat += part(x.id).stat;
    if (part(x.id).key !== "") key = part(x.id).key;
  }
  let best: number | null = null;
  // Free copies go to unpinned copies first: a pinned copy may be bought at an unknown price.
  const order = [...build].sort(
    (m, n) => Number(pinnedAt.has(m.path)) - Number(pinnedAt.has(n.path)),
  );
  for (const path of problem.paths) {
    const left = new Map(path.covers);
    let price = path.price;
    let ok = true;
    for (const x of order) {
      const free = left.get(x.id) ?? 0;
      if (free > 0) {
        left.set(x.id, free - 1);
        continue;
      }
      if (!part(x.id).available && !pinnedAt.has(x.path)) {
        ok = false;
        break;
      }
      price += part(x.id).price;
    }
    if (!ok) continue;
    if (problem.budget !== undefined && !(price <= problem.budget && price < UNKNOWN_PRICE)) {
      continue;
    }
    if (best === null || price < best) best = price;
  }
  if (best === null) return null;
  return { rating: problem.rate(key, stat), price: best, count: build.length };
}

/** Every build of the problem, or `null` when there are more than `limit`. */
export function allBuilds(problem: Problem, limit: number): Placed[][] | null {
  const builds: Placed[][] = [];
  interface Pending {
    readonly slot: SlotDef;
    readonly at: string;
  }
  const fill = (pending: readonly Pending[], acc: readonly Placed[]): boolean => {
    if (pending.length === 0) {
      builds.push([...acc]);
      return builds.length <= limit;
    }
    const [head, ...rest] = pending;
    const { slot, at } = head!;
    if (!slot.required && !fill(rest, acc)) return false;
    for (const id of slot.allowedItemIds) {
      const kids = problem.parts.get(id)!.slots.map((s) => ({ slot: s, at: `${at}/${s.nameId}` }));
      if (!fill([...kids, ...rest], [...acc, { path: at, id, slotId: slot.id }])) return false;
    }
    return true;
  };
  const ok = fill(
    problem.rootSlots.map((slot) => ({ slot, at: slot.nameId })),
    [],
  );
  return ok ? builds : null;
}

/** The slot id at each attachment path of a build the solver returned. */
export function placedOf(
  problem: Problem,
  attachments: Readonly<Record<string, string>>,
): Placed[] {
  return Object.entries(attachments).map(([path, id]) => {
    const segments = path.split("/");
    let slots = problem.rootSlots;
    let base = "";
    let slotId = "";
    for (const segment of segments) {
      const slot = slots.find((s) => s.nameId === segment)!;
      base = base === "" ? segment : `${base}/${segment}`;
      slotId = slot.id;
      const owner = attachments[base];
      slots = owner === undefined ? [] : problem.parts.get(owner)!.slots;
    }
    return { path, id, slotId };
  });
}
