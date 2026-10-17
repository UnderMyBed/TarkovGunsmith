import {
  adaptMod,
  buildPriceUnder,
  buildSlotGraph,
  itemAvailability,
  priceUnder,
  resolveBuild,
  selectWeaponTree,
  weaponPaths,
  type AttachablePart,
  type AvailabilityInput,
  type BuyForEntry,
  type PlayerProfile,
  type PresetContents,
  type PriceGate,
  type SlotDef,
  type SlotGraph,
  type WeaponTree,
} from "@tarkov/data";
import { weaponSpec, type BallisticWeapon } from "@tarkov/ballistics";
import type { Objective, OptimizationInput } from "../types.js";

/**
 * Random optimizer inputs in upstream's shapes — part records with trader offers, presets
 * sold as offers on the weapon, a profile or theorycraft, pins, budgets — and an oracle that
 * judges every build of one by the Builder's own rules: `resolveBuild` for conflicts, empty
 * required slots and orphans, `buildPriceUnder` (and the `weaponPaths` it buys the weapon by)
 * for the price, `itemAvailability` and `priceUnder` for what a profile can get, `weaponSpec`
 * for the objective. It shares nothing with the solver but those rules and the input.
 */

export const PROFILE: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 2, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: false,
  level: 20,
};
export const OBJECTIVES: readonly Objective[] = [
  "min-recoil",
  "max-ergonomics",
  "min-weight",
  "max-accuracy",
];

function offer(price: number | null, level: number, preset?: string): BuyForEntry {
  return {
    priceRUB: price,
    currency: "RUB",
    vendor: {
      __typename: "TraderOffer",
      normalizedName: "prapor",
      minTraderLevel: level,
      taskUnlock: null,
      trader: { normalizedName: "prapor" },
    },
    ...(preset === undefined ? {} : { preset: { id: preset, normalizedName: preset } }),
  };
}

function flea(price: number | null): BuyForEntry {
  return {
    priceRUB: price,
    currency: "RUB",
    vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 1 },
  };
}

interface RawSlot {
  id: string;
  nameId: string;
  name: string;
  required: boolean;
  filters: { allowedCategories: never[]; allowedItems: string[] };
}

export interface RecordsCase {
  readonly input: OptimizationInput;
  readonly graph: SlotGraph;
  readonly catalog: ReadonlyMap<string, AttachablePart>;
  /** Every build of the weapon, slot path → part id. */
  readonly builds: readonly Record<string, string>[];
}

/**
 * A weapon with 5–11 parts: a receiver slot that may hold a barrel slot, nested slots,
 * conflicts by item (some self-listed) and by slot, prices that are known, unknown or
 * behind a trader level the profile lacks, parts nobody sells, presets that supply a
 * complete build's parts, pins (empty, allowed, not allowed, and for an unknown id), budgets,
 * and any of the four objectives. `null` when the weapon has more than `limit` builds.
 */
export function randomRecords(rnd: () => number, limit: number): RecordsCase | null {
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const n = int(5, 11);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const receiverCount = int(1, 2);
  const barrelCount = int(0, 3);
  const receivers = ids.slice(0, receiverCount);
  const barrels = ids.slice(receiverCount, receiverCount + barrelCount);
  const plain = ids.slice(receiverCount + barrelCount);
  let slotN = 0;
  const slotIds: string[] = [];
  const slot = (nameId: string, allowed: string[], required = rnd() < 0.35): RawSlot => {
    const id = `s${slotN++}`;
    slotIds.push(id);
    return {
      id,
      nameId,
      name: nameId,
      required,
      filters: { allowedCategories: [], allowedItems: [...new Set(allowed)] },
    };
  };
  const slotsOf = new Map<string, RawSlot[]>();
  for (let i = 0; i < n; i++) {
    const id = ids[i]!;
    const slots: RawSlot[] = [];
    if (receivers.includes(id) && barrels.length > 0) {
      slots.push(slot("mod_barrel", [...barrels.filter(() => rnd() < 0.8), barrels[0]!]));
    }
    // Children come only from later plain parts: a DAG with at most one barrel per build.
    const later = plain.filter((x) => ids.indexOf(x) > i);
    if (later.length > 0) {
      for (let k = int(0, plain.includes(id) ? 1 : 2); k > 0; k--) {
        slots.push(
          slot(
            `m${slots.length}`,
            Array.from({ length: int(1, 3) }, () => pick(later)),
          ),
        );
      }
    }
    slotsOf.set(id, slots);
  }
  const rootSlots = [slot("mod_reciever", receivers, rnd() < 0.7)];
  if (plain.length > 0) {
    for (let k = int(1, 2); k > 0; k--) {
      rootSlots.push(
        slot(
          `r${k}`,
          Array.from({ length: int(1, 3) }, () => pick(plain)),
        ),
      );
    }
  }

  const raw: Record<string, unknown> = {};
  const parts: AttachablePart[] = [];
  for (const id of ids) {
    const barrel = barrels.includes(id);
    raw[id] = {
      id,
      name: id,
      properties: {
        propertiesType: barrel ? "ItemPropertiesBarrel" : "ItemPropertiesWeaponMod",
        slots: slotsOf.get(id),
      },
    };
    const sold = rnd();
    const buyFor: BuyForEntry[] =
      sold < 0.12 ? [] : [offer(rnd() < 0.1 ? null : int(0, 9) * 100, sold < 0.25 ? 4 : int(1, 2))];
    if (rnd() < 0.2) buyFor.push(flea(rnd() < 0.2 ? null : int(0, 9) * 100));
    const conflictingItems = ids.filter((o) => o !== id && rnd() < 0.1);
    if (rnd() < 0.03) conflictingItems.push(id);
    const modifiers = {
      ergonomics: int(-5, 8),
      recoilModifier: int(-30, 10) / 100,
      accuracyModifier: int(-5, 5) / 100,
      velocity: 0,
    };
    parts.push({
      id,
      name: id,
      shortName: id,
      iconLink: `https://example.com/${id}.png`,
      weight: int(0, 20) / 10,
      types: ["mods"],
      minLevelForFlea: null,
      properties: barrel
        ? {
            propertiesType: "ItemPropertiesBarrel",
            ...modifiers,
            centerOfImpact: rnd() < 0.15 ? 0 : int(1, 9) / 100,
            deviationMax: pick([0, 5, 10, 20]),
          }
        : { propertiesType: "ItemPropertiesWeaponMod", ...modifiers },
      conflictingItems,
      conflictingSlotIds: slotIds.filter(() => rnd() < 0.04),
      buyFor,
    });
  }
  raw.w = {
    id: "w",
    name: "w",
    properties: { propertiesType: "ItemPropertiesWeapon", slots: rootSlots },
  };
  const doc = { items: raw };
  const graph = buildSlotGraph(doc);
  const tree: WeaponTree = selectWeaponTree(doc, "w", graph);
  const catalog = new Map(parts.map((p) => [p.id, p]));

  const builds: Record<string, string>[] = [];
  interface Pending {
    readonly slot: SlotDef;
    readonly at: string;
  }
  const fill = (pending: readonly Pending[], acc: Record<string, string>): boolean => {
    if (pending.length === 0) {
      builds.push({ ...acc });
      return builds.length <= limit;
    }
    const [head, ...rest] = pending;
    if (!fill(rest, acc)) return false;
    for (const id of head!.slot.allowedItemIds) {
      const kids = (graph.owners[id]?.slots ?? []).map((s) => ({
        slot: s,
        at: `${head!.at}/${s.nameId}`,
      }));
      acc[head!.at] = id;
      const more = fill([...kids, ...rest], acc);
      delete acc[head!.at];
      if (!more) return false;
    }
    return true;
  };
  const weaponSlots = graph.owners.w?.slots ?? [];
  if (
    !fill(
      weaponSlots.map((s) => ({ slot: s, at: s.nameId })),
      {},
    )
  )
    return null;

  const weaponBuyFor: BuyForEntry[] =
    rnd() < 0.15 ? [] : [offer(rnd() < 0.1 ? null : int(1, 30) * 100, int(1, 3))];
  const presets: PresetContents[] = [];
  for (let k = int(0, 2); k > 0; k--) {
    const id = `preset${k}`;
    presets.push({ id, attachments: pick(builds), buyFor: [] });
    if (rnd() < 0.85) weaponBuyFor.push(offer(int(5, 60) * 100, int(1, 3), id));
  }

  const visible: [string, SlotDef][] = [];
  const walk = (owner: string, base: string, depth: number) => {
    if (depth > 5) return;
    for (const s of graph.owners[owner]?.slots ?? []) {
      const at = base === "" ? s.nameId : `${base}/${s.nameId}`;
      visible.push([at, s]);
      for (const id of s.allowedItemIds) walk(id, at, depth + 1);
    }
  };
  walk("w", "", 0);
  const pins = new Map<string, string | null>();
  for (let k = int(0, 2); k > 0; k--) {
    const [at, s] = pick(visible);
    const r = rnd();
    pins.set(
      at,
      r < 0.25 ? null : r < 0.85 ? pick(s.allowedItemIds) : r < 0.95 ? pick(ids) : "ghost",
    );
  }

  const weapon: BallisticWeapon = {
    id: "w",
    name: "w",
    baseErgonomics: 50,
    baseVerticalRecoil: 100,
    baseHorizontalRecoil: 200,
    baseWeight: 3,
    centerOfImpact: rnd() < 0.15 ? 0 : int(1, 9) / 100,
    deviationCurve: 1.35,
    velocity: 0,
    fireRate: 600,
    effectiveDistance: 300,
    sightingRange: 100,
    defaultAmmo: null,
  };
  const gate: PriceGate = rnd() < 0.5 ? null : PROFILE;
  const budget = rnd() < 0.4 ? int(0, 60) * 100 : undefined;
  return {
    input: {
      weapon,
      weaponItem: { shortName: "w", types: ["gun"], buyFor: weaponBuyFor },
      presets,
      slotTree: tree,
      parts,
      constraints: {
        profile: gate,
        pinnedSlots: pins,
        ...(budget === undefined ? {} : { budgetRub: budget }),
      },
      objective: pick(OBJECTIVES),
      timeoutMs: 30_000,
    },
    graph,
    catalog,
    builds,
  };
}

export interface Judged {
  readonly rating: number;
  /** Parts whose price is unknown. */
  readonly unknown: number;
  /** The roubles that are known. */
  readonly known: number;
  readonly count: number;
  /** A part kept on a pin has no price the profile can pay, and no way to buy the gun supplies it. */
  readonly pinnedUnpriced: boolean;
}

/** Best rating (MOA within a float tolerance), then fewest unknown prices, then roubles, then parts. */
export function compareJudged(a: Judged, b: Judged): number {
  const tolerance = 1e-9 * Math.max(1, Math.abs(a.rating), Math.abs(b.rating));
  if (Math.abs(a.rating - b.rating) > tolerance) return a.rating - b.rating;
  return a.unknown - b.unknown || a.known - b.known || a.count - b.count;
}

export interface Relax {
  readonly budget?: boolean;
  readonly pins?: boolean;
  readonly conflicts?: boolean;
}

/** A listing the profile can use, at no known price: how a pinned part is placed. */
const UNPRICED_OFFER: BuyForEntry = offer(null, 1);

/**
 * How the Builder scores this build, or `null` when it is not one the optimizer may return:
 * a conflict, an empty required slot, an orphan, a broken pin, a part no weapon path can get,
 * or over the budget. A part kept on a pin skips the availability gate: where the profile
 * cannot buy it, it is priced as a listing of unknown price, as the optimizer places it.
 */
export function judge(
  c: RecordsCase,
  attachments: Readonly<Record<string, string>>,
  relax: Relax = {},
): Judged | null {
  const { input, graph, catalog } = c;
  const gate = input.constraints.profile;
  const resolved = resolveBuild(input.slotTree, attachments, catalog);
  if (!relax.conflicts && resolved.conflicts.length > 0) return null;
  if (resolved.missingRequired.length > 0 || resolved.orphaned.length > 0) return null;
  const visible = new Map<string, SlotDef>();
  const walk = (owner: string, base: string) => {
    for (const s of graph.owners[owner]?.slots ?? []) {
      const at = base === "" ? s.nameId : `${base}/${s.nameId}`;
      visible.set(at, s);
      const id = resolved.attachments[at];
      if (id !== undefined) walk(id, at);
    }
  };
  walk("w", "");
  const kept = new Set<string>();
  for (const [at, pin] of relax.pins ? [] : input.constraints.pinnedSlots) {
    const s = visible.get(at);
    if (s === undefined) continue;
    if (pin === null) {
      if (!s.required && resolved.attachments[at] !== undefined) return null;
      continue;
    }
    if (!catalog.has(pin) || !s.allowedItemIds.includes(pin)) continue;
    if (resolved.attachments[at] !== pin) return null;
    kept.add(at);
  }
  // Copies a path supplies are spent in list order: the ones the profile cannot buy unpinned
  // must take them, so the pinned copies, which can go unsupplied, come last.
  const unbuyablePin = (p: (typeof resolved.placed)[number]) =>
    kept.has(p.path) && !itemAvailability(p.part, gate).available;
  const placed = [
    ...resolved.placed.filter((p) => !unbuyablePin(p)).map((p) => p.part),
    ...resolved.placed.filter(unbuyablePin).map((p) => ({ ...p.part, buyFor: [UNPRICED_OFFER] })),
  ];
  const weapon = { ...input.weaponItem, id: "w" };
  const price = buildPriceUnder(gate, { weapon, parts: placed, presets: input.presets });
  if (price.status === "unobtainable") return null;
  const budget = input.constraints.budgetRub;
  if (!relax.budget && budget !== undefined) {
    if (price.status !== "priced" || price.totalRUB > budget) return null;
  }
  const paths = weaponPaths(gate, weapon, input.presets);
  const pinnedUnpriced = resolved.placed.some(
    (p) =>
      kept.has(p.path) &&
      priceUnder(gate, p.part) === null &&
      paths.every((path) => (path.covers.get(p.itemId) ?? 0) === 0),
  );
  const spec = weaponSpec(input.weapon, placed.map(adaptMod));
  const rating = {
    "min-recoil": spec.verticalRecoil,
    "max-ergonomics": -spec.ergonomics,
    "min-weight": spec.weight,
    "max-accuracy": spec.accuracy,
  }[input.objective];
  return {
    rating,
    unknown: price.status === "priced" ? 0 : price.unpriced.length,
    known: price.status === "priced" ? price.totalRUB : price.knownRUB,
    count: placed.length,
    pinnedUnpriced,
  };
}

/** The cheapest way to buy the weapon alone, or `null` when its price is unknown or none is open. */
export function weaponPrice(c: RecordsCase): number | null {
  const price = buildPriceUnder(c.input.constraints.profile, {
    weapon: { ...c.input.weaponItem, id: "w" },
    parts: [],
    presets: c.input.presets,
  });
  return price.status === "priced" ? price.totalRUB : null;
}

/** Whether no way to buy the weapon is open to the profile. */
export function weaponUnobtainable(c: RecordsCase): boolean {
  const weapon: AvailabilityInput & { id: string } = { ...c.input.weaponItem, id: "w" };
  const price = buildPriceUnder(c.input.constraints.profile, {
    weapon,
    parts: [],
    presets: c.input.presets,
  });
  return price.status === "unobtainable";
}
