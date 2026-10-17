import { adaptMod, itemAvailability, partsById, resolveBuild, type BuildV6 } from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import {
  cheapestBuild,
  diagnose,
  KEEPS_PINS,
  rub,
  unknownPriceVerdict,
  unpricedPins,
} from "./diagnose.js";
import { pinReport } from "./pins.js";
import { buildProblem, UNKNOWN_PRICE, type Problem } from "./problem.js";
import { SolveTimeout } from "./relaxed.js";
import { solve } from "./solve.js";
import type { OptimizationInput, OptimizationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;

type Refusal = Extract<OptimizationResult, { reason: "infeasible-budget" }>;

/**
 * Why a budget run cannot start, or `null` when it can: the gun alone is over budget or has
 * no known price (`byPins: false`), or a part pinned to one of the weapon's own slots — a path
 * every build has — has no price the profile can pay and no path supplies it free
 * (`byPins: true`). A pin deeper down holds only where its path exists, so a build without
 * that path may still fit; the search decides those.
 *
 * Each refusal is true of every build there is. Whether the pins are to blame, rather than
 * some other part nobody prices, is for `unknownPriceVerdict` to say.
 */
function refuseBudget(
  input: OptimizationInput,
  problem: Problem,
  budgetRub: number,
): { refusal: Refusal; byPins: boolean } | null {
  const name = input.weaponItem.shortName;
  const cheapest = Math.min(...problem.paths.map((p) => p.price));
  if (cheapest >= UNKNOWN_PRICE) {
    return {
      byPins: false,
      refusal: {
        ok: false,
        reason: "infeasible-budget",
        cause: "unpriced",
        message: `No ${name} you can get has a known price, so no build can be shown to fit a budget.`,
      },
    };
  }
  if (cheapest > budgetRub) {
    return {
      byPins: false,
      refusal: {
        ok: false,
        reason: "infeasible-budget",
        cause: "over-budget",
        message: `The cheapest ${name} you can get costs ${rub(cheapest)}, over the ${rub(budgetRub)} budget.`,
      },
    };
  }
  const pinned = [...unpricedPins(problem).keys()].filter((path) =>
    problem.rootSlots.some((s) => s.nameId === path),
  );
  if (pinned.length === 0) return null;
  return {
    byPins: true,
    refusal: {
      ok: false,
      reason: "infeasible-budget",
      cause: "pins",
      paths: pinned,
      message: KEEPS_PINS,
    },
  };
}

const titled = (trader: string) => trader.charAt(0).toUpperCase() + trader.slice(1);

/**
 * Why the weapon cannot be bought: the cause a player can act on, if there is one. Reads every
 * offer that buys it, its presets' included, as `weaponPaths` does.
 */
function unavailableMessage(input: OptimizationInput): string {
  const name = input.weaponItem.shortName;
  const profile = input.constraints.profile;
  const offers = [
    ...(input.weaponItem.buyFor ?? []),
    ...(input.presets ?? []).flatMap((p) => p.buyFor ?? []),
  ];
  if (offers.length === 0) return `No trader or flea listing sells the ${name}.`;
  const availability = itemAvailability({ buyFor: offers, types: input.weaponItem.types }, profile);
  if (!availability.available && availability.reason === "untracked-trader") {
    // Every other kind of offer outranks this reason: each offer left is an untracked trader's.
    const traders = [
      ...new Set(
        // The offer collector names a trader's vendor after the trader (`buy-for.ts`).
        offers.map((o) => o.vendor.normalizedName),
      ),
    ].map(titled);
    const barter = offers.every((o) => o.vendor.__typename === "TraderBarter");
    const who = traders.join(" and ");
    return `Only ${who} ${traders.length === 1 ? "sells" : "sell"} the ${name}${barter ? ", by barter" : ""}, and no trader level you can set reaches ${traders.length === 1 ? who : "them"}.`;
  }
  if (!availability.available && availability.reason === "flea-unlisted") {
    return `Nobody is listing the ${name} on the flea, and no trader you can reach sells it.`;
  }
  return profile === null
    ? `You can't get the ${name}.`
    : `You can't get the ${name} on this profile.`;
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
  const budgetRub = input.constraints.budgetRub;
  let refusal: Refusal | null = null;
  try {
    const refused = budgetRub === undefined ? null : refuseBudget(input, problem, budgetRub);
    if (refused !== null) {
      refusal = refused.refusal;
      // The budget is only the cause if some build exists without it.
      const cheapest = cheapestBuild(problem, tree, catalog, deadline);
      if (cheapest === null) return diagnose(problem, tree, catalog, deadline, null);
      return refused.byPins ? unknownPriceVerdict(problem, tree, catalog, deadline) : refusal;
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
    // A refusal is true of every build there is: it stands when the question of whether any
    // exists runs out of time.
    if (error instanceof SolveTimeout) return refusal ?? { ok: false, reason: "timeout" };
    throw error;
  }
}
