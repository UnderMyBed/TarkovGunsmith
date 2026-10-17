import {
  partsById,
  priceUnder,
  weaponPaths,
  type AttachablePart,
  type BuildV6,
} from "@tarkov/data";
import { branchAndBound, type BudgetPath } from "./branch-and-bound.js";
import type { OptimizationInput, OptimizationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;

const rub = (amount: number): string => `₽${new Intl.NumberFormat("en-US").format(amount)}`;

type Refusal = Extract<OptimizationResult, { reason: "infeasible-budget" | "pinned-unpriced" }>;

/**
 * Why a budget run cannot start, or `null` when it can. Checked before searching so the user
 * hears the real reason: the gun alone is over budget or unpriced, or a pinned part has no
 * price the profile can pay that no path supplies for free.
 */
function refuseBudget(
  input: OptimizationInput,
  budgetRub: number,
  paths: readonly BudgetPath[],
  parts: ReadonlyMap<string, AttachablePart>,
): Refusal | null {
  const name = input.weaponItem.shortName;
  if (paths.length === 0) {
    return {
      ok: false,
      reason: "infeasible-budget",
      message: `You can't get the ${name} on this profile.`,
    };
  }
  const cheapest = Math.min(...paths.map((p) => p.price));
  if (cheapest === Number.POSITIVE_INFINITY) {
    return {
      ok: false,
      reason: "infeasible-budget",
      message: `No ${name} you can get has a known price, so no build can be shown to fit a budget.`,
    };
  }
  if (cheapest > budgetRub) {
    return {
      ok: false,
      reason: "infeasible-budget",
      message: `The cheapest ${name} you can get costs ${rub(cheapest)}, over the ${rub(budgetRub)} budget.`,
    };
  }
  const unpriced: AttachablePart[] = [];
  for (const id of new Set(input.constraints.pinnedSlots.values())) {
    if (id === null) continue;
    const part = parts.get(id);
    if (part === undefined) continue;
    if (priceUnder(input.constraints.profile, part) !== null) continue;
    if (paths.some((p) => (p.covers.get(id) ?? 0) > 0)) continue;
    unpriced.push(part);
  }
  if (unpriced.length === 0) return null;
  return {
    ok: false,
    reason: "pinned-unpriced",
    itemIds: unpriced.map((p) => p.id),
    message: `No price you can pay is known for ${unpriced.map((p) => p.name).join(", ")}. Unpin ${unpriced.length === 1 ? "it" : "them"} or clear the budget.`,
  };
}

/**
 * Top-level entry point. Wraps the B&B DFS with timeout accounting and
 * translates to the typed `OptimizationResult` shape.
 */
export function optimize(input: OptimizationInput): OptimizationResult {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let aborted = false;
  const parts = partsById(input.parts);
  const paths: BudgetPath[] = weaponPaths(
    input.constraints.profile,
    input.weaponItem,
    input.presets,
  ).map((path) => ({
    price: path.availability.priceRUB ?? Number.POSITIVE_INFINITY,
    covers: path.covers,
  }));
  const budgetRub = input.constraints.budgetRub;
  if (budgetRub !== undefined) {
    const refusal = refuseBudget(input, budgetRub, paths, parts);
    if (refusal !== null) return refusal;
  }

  const best = branchAndBound(
    {
      weapon: input.weapon,
      parts,
      graph: input.slotTree.graph,
      profile: input.constraints.profile,
      pinnedSlots: input.constraints.pinnedSlots,
      objective: input.objective,
      budgetRub,
      // Without a budget the weapon's price decides nothing; one free path keeps the search
      // running for a weapon the profile cannot buy.
      paths: budgetRub === undefined ? [{ price: 0, covers: new Map() }] : paths,
      deadline,
      onNodeVisit: () => {
        if (Date.now() >= deadline) {
          aborted = true;
          return false;
        }
        return true;
      },
    },
    input.slotTree.slots,
  );

  // Also check the deadline post-hoc — a fast-finishing search may never
  // have triggered the periodic onNodeVisit callback yet still overran.
  if (!aborted && Date.now() >= deadline) {
    aborted = true;
  }

  if (best === null) {
    return {
      ok: false,
      reason: aborted ? "timeout" : "no-valid-combinations",
    };
  }

  // Pure function: no clock-derived field in the returned build. Callers
  // that want a real timestamp stamp it themselves.
  const build: BuildV6 = {
    version: 6,
    weaponId: input.weapon.id,
    attachments: { ...best.attachments },
    orphaned: [],
    createdAt: "1970-01-01T00:00:00.000Z",
  };

  return {
    ok: true,
    build,
    stats: best.stats,
    ...(aborted ? { partial: true } : {}),
  };
}
