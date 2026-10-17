import {
  adaptMod,
  itemAvailability,
  priceUnder,
  weaponPaths,
  type AttachablePart,
  type SlotDef,
} from "@tarkov/data";
import { barrelDeviation, CM_PER_MOA_AT_100M, type BallisticWeapon } from "@tarkov/ballistics";
import type { Objective, OptimizationInput } from "./types.js";

/**
 * A part's price when no price the profile can pay is known. Prices are whole roubles, so a
 * total below this is known and a total at or above it is not; ranking totals by the plain sum
 * then ranks them by how many prices are unknown, then by the known roubles — an order that
 * adds up, which the search needs. A build with an unknown price never fits a budget.
 */
export const UNKNOWN_PRICE = 1e12;

/**
 * Stats are summed as integers in millionths so that equal builds tie exactly. Upstream
 * publishes at most four decimals for any stat the solver reads.
 */
export const STAT_SCALE = 1e6;

/** One part as the search sees it. */
export interface SolverPart {
  readonly id: string;
  /** The part's own slots, from the slot graph. */
  readonly slots: readonly SlotDef[];
  /** The objective's figure for this part, as an integer to minimise. */
  readonly stat: number;
  /**
   * For max-accuracy, the part's id when it sets the build's dispersion (a barrel: the only
   * type with a `centerOfImpact` or `deviationMax`); otherwise `""`.
   */
  readonly key: string;
  /** Its price under the profile, or {@link UNKNOWN_PRICE}. */
  readonly price: number;
  /** Whether the profile can get it on its own. A path that supplies it makes it obtainable too. */
  readonly available: boolean;
  readonly conflictingItems: readonly string[];
  readonly conflictingSlotIds: readonly string[];
}

/** One way to buy the weapon, as the search prices it. */
export interface SolverPath {
  /** The preset bought, or `null` for the receiver. */
  readonly presetId: string | null;
  /** {@link UNKNOWN_PRICE} when not known. */
  readonly price: number;
  /** Item id → how many of it the path supplies; every count is at least 1. */
  readonly covers: ReadonlyMap<string, number>;
}

export interface Problem {
  readonly rootSlots: readonly SlotDef[];
  /** Every catalog part reachable from the weapon's slots. */
  readonly parts: ReadonlyMap<string, SolverPart>;
  readonly paths: readonly SolverPath[];
  readonly pins: ReadonlyMap<string, string | null>;
  readonly budget: number | undefined;
  /**
   * The objective's real figure for a build: its summed {@link SolverPart.stat}, or for
   * max-accuracy the MOA, which also depends on the dispersion key.
   */
  readonly rate: (key: string, stat: number) => number;
  /** Max-accuracy only: the MOA of a build with this key and no accuracy modifiers. */
  readonly multiplier?: (key: string) => number;
  /** Told each time the search takes a candidate build. */
  readonly tick?: () => void;
}

function partStat(objective: Objective, part: AttachablePart): number {
  const mod = adaptMod(part);
  const value = (() => {
    switch (objective) {
      case "min-recoil":
        return mod.recoilModifier;
      case "max-ergonomics":
        return -mod.ergonomicsDelta;
      case "min-weight":
        return mod.weight;
      case "max-accuracy":
        return -mod.accuracyModifier;
    }
  })();
  return Math.round(value * STAT_SCALE);
}

function setsDispersion(part: AttachablePart): boolean {
  const mod = adaptMod(part);
  return mod.centerOfImpact !== 0 || (mod.deviationMax !== null && mod.deviationMax !== 0);
}

/**
 * MOA with no accuracy modifiers, as `weaponSpec` computes it, for a build whose dispersion is
 * set by `part` (or by the weapon alone when `part` is undefined).
 */
function moaMultiplier(weapon: BallisticWeapon, part: AttachablePart | undefined): number {
  const mod = part === undefined ? undefined : adaptMod(part);
  const deviationMax =
    mod?.deviationMax !== null && mod?.deviationMax !== undefined && mod.deviationMax !== 0
      ? mod.deviationMax
      : 100;
  const centerOfImpact = weapon.centerOfImpact + (mod?.centerOfImpact ?? 0);
  return (
    (centerOfImpact * barrelDeviation(weapon.deviationCurve, deviationMax) * 100) /
    CM_PER_MOA_AT_100M
  );
}

/** One counter for the whole run: every search a run makes reports into it. */
function progressCounter(onProgress: NonNullable<OptimizationInput["onProgress"]>): () => void {
  let nodes = 0;
  return () => onProgress({ nodes: ++nodes });
}

/**
 * The search's view of one optimization: the parts the weapon can reach, each reduced to the
 * numbers the objective, price and conflicts need, and the ways to buy the weapon.
 */
export function buildProblem(
  input: OptimizationInput,
  catalog: ReadonlyMap<string, AttachablePart>,
): Problem {
  const { graph, weaponId } = input.slotTree;
  const gate = input.constraints.profile;
  const parts = new Map<string, SolverPart>();
  // Each part is pushed once, when first reached.
  const stack = [weaponId];
  while (stack.length > 0) {
    const owner = stack.pop()!;
    for (const slot of graph.owners[owner]?.slots ?? []) {
      for (const id of slot.allowedItemIds) {
        const part = catalog.get(id);
        if (part === undefined || parts.has(id)) continue;
        parts.set(id, {
          id,
          slots: graph.owners[id]?.slots ?? [],
          stat: partStat(input.objective, part),
          key: input.objective === "max-accuracy" && setsDispersion(part) ? id : "",
          price: priceUnder(gate, part) ?? UNKNOWN_PRICE,
          available: itemAvailability(part, gate).available,
          conflictingItems: part.conflictingItems,
          conflictingSlotIds: part.conflictingSlotIds,
        });
        stack.push(id);
      }
    }
  }
  const paths = weaponPaths(gate, input.weaponItem, input.presets).map((path): SolverPath => ({
    presetId: path.presetId,
    price: path.availability.priceRUB ?? UNKNOWN_PRICE,
    covers: path.covers,
  }));
  const base = {
    rootSlots: graph.owners[weaponId]?.slots ?? [],
    parts,
    paths,
    pins: input.constraints.pinnedSlots,
    budget: input.constraints.budgetRub,
    ...(input.onProgress === undefined ? {} : { tick: progressCounter(input.onProgress) }),
  };
  if (input.objective !== "max-accuracy") return { ...base, rate: (_key, stat) => stat };
  const multipliers = new Map<string, number>();
  const multiplier = (key: string): number => {
    let m = multipliers.get(key);
    if (m === undefined) {
      m = moaMultiplier(input.weapon, key === "" ? undefined : catalog.get(key));
      multipliers.set(key, m);
    }
    return m;
  };
  // stat is minus the summed accuracyModifier, so MOA = multiplier · (1 − Σ) = m · (1 + stat).
  return { ...base, multiplier, rate: (key, stat) => multiplier(key) * (1 + stat / STAT_SCALE) };
}
