import {
  adaptMod,
  partsById,
  priceUnder,
  resolveBuild,
  type AttachablePart,
  type BuildV6,
} from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import { diagnose, rub } from "./diagnose.js";
import { pinReport } from "./pins.js";
import { buildProblem, UNKNOWN_PRICE, type Problem } from "./problem.js";
import { SolveTimeout } from "./relaxed.js";
import { solve } from "./solve.js";
import type { OptimizationInput, OptimizationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;

type Refusal = Extract<OptimizationResult, { reason: "infeasible-budget" | "pinned-unpriced" }>;

/**
 * Why a budget run cannot start, or `null` when it can: the gun alone is over budget or has
 * no known price, or a pinned part has no price the profile can pay that no path supplies free.
 */
function refuseBudget(
  input: OptimizationInput,
  problem: Problem,
  budgetRub: number,
  catalog: ReadonlyMap<string, AttachablePart>,
): Refusal | null {
  const name = input.weaponItem.shortName;
  const cheapest = Math.min(...problem.paths.map((p) => p.price));
  if (cheapest >= UNKNOWN_PRICE) {
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
    const part = catalog.get(id);
    if (part === undefined) continue;
    if (priceUnder(input.constraints.profile, part) !== null) continue;
    if (problem.paths.some((p) => (p.covers.get(id) ?? 0) > 0)) continue;
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
 * The best build for the objective, exactly: no build that fills every required slot, has no
 * clashing parts, keeps the pins and fits the budget does better on the objective, and among
 * those that tie none is cheaper, and among those none has fewer parts. See `search.ts` for how.
 */
export function optimize(input: OptimizationInput): OptimizationResult {
  const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const catalog = partsById(input.parts);
  const problem = buildProblem(input, catalog);
  if (problem.paths.length === 0) {
    return {
      ok: false,
      reason: "weapon-unavailable",
      message: `You can't get the ${input.weaponItem.shortName} on this profile.`,
    };
  }
  const budgetRub = input.constraints.budgetRub;
  if (budgetRub !== undefined) {
    const refusal = refuseBudget(input, problem, budgetRub, catalog);
    if (refusal !== null) return refusal;
  }

  const tree = input.slotTree;
  try {
    const found = solve(problem, tree, catalog, deadline);
    if (found === null) return diagnose(problem, tree, catalog, deadline);
    const { placed, attachments } = resolveBuild(tree, found.attachments, catalog);
    // Pure function: no clock-derived field in the returned build. Callers that want a real
    // timestamp stamp it themselves.
    const build: BuildV6 = {
      version: 6,
      weaponId: input.weapon.id,
      attachments: { ...attachments },
      orphaned: [],
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    return {
      ok: true,
      build,
      stats: weaponSpec(
        input.weapon,
        placed.map((p) => adaptMod(p.part)),
      ),
      pins: pinReport(tree.graph, tree.weaponId, attachments, input.constraints.pinnedSlots, (id) =>
        catalog.has(id),
      ),
    };
  } catch (error) {
    if (error instanceof SolveTimeout) return { ok: false, reason: "timeout" };
    throw error;
  }
}
