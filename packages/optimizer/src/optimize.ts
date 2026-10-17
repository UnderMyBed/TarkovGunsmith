import {
  adaptMod,
  itemAvailability,
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
import { pinHonourable, SolveTimeout } from "./relaxed.js";
import { solve } from "./solve.js";
import type { OptimizationInput, OptimizationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;

type Refusal = Extract<OptimizationResult, { reason: "infeasible-budget" | "pinned-unpriced" }>;

/**
 * Why a budget run cannot start, or `null` when it can: the gun alone is over budget or has
 * no known price, or a part pinned to one of the weapon's own slots — a path every build has —
 * has no price the profile can pay and no path supplies it free. A pin deeper down holds only
 * where its path exists, so a build without that path may still fit; the search decides those.
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
  const unpriced = new Map<string, AttachablePart>();
  for (const [path, id] of input.constraints.pinnedSlots) {
    if (id === null) continue;
    const slot = problem.rootSlots.find((s) => s.nameId === path);
    if (slot === undefined || !pinHonourable(problem, slot, id)) continue;
    if (priceUnder(input.constraints.profile, catalog.get(id)!) !== null) continue;
    if (problem.paths.some((p) => (p.covers.get(id) ?? 0) > 0)) continue;
    unpriced.set(id, catalog.get(id)!);
  }
  if (unpriced.size === 0) return null;
  const parts = [...unpriced.values()];
  return {
    ok: false,
    reason: "pinned-unpriced",
    itemIds: parts.map((p) => p.id),
    message: `No price you can pay is known for ${parts.map((p) => p.name).join(", ")}. Unpin ${parts.length === 1 ? "it" : "them"} or clear the budget.`,
  };
}

/** Why the weapon cannot be bought: the cause a player can act on, if there is one. */
function unavailableMessage(input: OptimizationInput): string {
  const name = input.weaponItem.shortName;
  const availability = itemAvailability(input.weaponItem, input.constraints.profile);
  if (
    input.constraints.profile === null ||
    (!availability.available && availability.reason === "no-sources")
  ) {
    // Theorycraft opens every gate, so only a weapon nothing sells is refused there.
    return `No trader or flea listing sells the ${name}.`;
  }
  if (!availability.available && availability.reason === "untracked-trader") {
    const trader = availability.traderNormalizedName;
    const named = trader.charAt(0).toUpperCase() + trader.slice(1);
    return `Only ${named} sells the ${name}${availability.payment === "barter" ? ", by barter" : ""}, and no trader level you can set reaches ${named}.`;
  }
  return `You can't get the ${name} on this profile.`;
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
    return { ok: false, reason: "weapon-unavailable", message: unavailableMessage(input) };
  }

  const tree = input.slotTree;
  try {
    const budgetRub = input.constraints.budgetRub;
    const refusal =
      budgetRub === undefined ? null : refuseBudget(input, problem, budgetRub, catalog);
    if (refusal !== null) {
      // The budget is only the cause if some build exists without it.
      const free = solve({ ...problem, budget: undefined }, tree, catalog, deadline);
      return free === null ? diagnose(problem, tree, catalog, deadline) : refusal;
    }
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
