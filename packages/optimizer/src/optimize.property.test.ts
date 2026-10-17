import { describe, expect, it } from "vitest";
import {
  compareJudged,
  judge,
  randomRecords,
  unpricedPinPaths,
  weaponPrice,
  weaponUnobtainable,
  type Judged,
  type RecordsCase,
  type Relax,
} from "./__fixtures__/random-records.js";
import { prng } from "./__fixtures__/random-problem.js";
import { optimize } from "./optimize.js";
import type { OptimizationReason } from "./types.js";

const CASES = 400;
const MAX_BUILDS = 20_000;

/** Every build that passes the Builder's rules once `relax` lifts some of them. */
function buildsUnder(c: RecordsCase, relax: Relax): Judged[] {
  return c.builds.flatMap((b) => judge(c, b, relax) ?? []);
}

/** A failure the oracle can name exactly: the reason, and for a budget failure its cause. */
type Verdict = OptimizationReason | `infeasible-budget/${"over-budget" | "pins" | "unpriced"}`;

/**
 * The one verdict that is true of a case with no build:
 *
 * - the weapon, when no way to buy it is open;
 * - the budget, when a build exists without it:
 *   - over budget, when the gun alone is, or some build has a known price;
 *   - unpriced, when the gun has no known price;
 *   - else the unpriced pins, when dropping the pinned parts nobody prices gives a build of
 *     known price;
 *   - else the pins, when dropping every pin does;
 *   - else unpriced: no build has a known price, pinned or not;
 * - else the pins, when a build exists once some are broken: a pinned part placed at its own
 *   pin's path as the pin would place it, and nowhere else unless the profile can get it;
 * - else a required slot, when none exists even with conflicts ignored;
 * - else conflicts.
 */
function trueVerdict(c: RecordsCase): Verdict {
  if (weaponUnobtainable(c)) return "weapon-unavailable";
  const { budgetRub, pinnedSlots } = c.input.constraints;
  if (budgetRub !== undefined) {
    const free = buildsUnder(c, { budget: true });
    if (free.length > 0) {
      const gun = weaponPrice(c);
      if (gun === null) return "infeasible-budget/unpriced";
      if (gun > budgetRub || free.some((j) => j.unknown === 0)) {
        return "infeasible-budget/over-budget";
      }
      const known = (relax: Relax) => buildsUnder(c, relax).some((j) => j.unknown === 0);
      if (known({ budget: true, dropPins: unpricedPinPaths(c) })) return "pinned-unpriced";
      if (known({ budget: true, pins: true })) return "infeasible-budget/pins";
      return "infeasible-budget/unpriced";
    }
  }
  if (pinnedSlots.size > 0 && buildsUnder(c, { budget: true, pins: true }).length > 0) {
    return "pin-conflict";
  }
  if (buildsUnder(c, { budget: true, pins: true, conflicts: true }).length === 0) {
    return "required-slot";
  }
  return "no-valid-combinations";
}

function verdictOf(result: Extract<ReturnType<typeof optimize>, { ok: false }>): Verdict {
  return result.reason === "infeasible-budget"
    ? `infeasible-budget/${result.cause}`
    : result.reason;
}

/**
 * Whether lifting what the failure names is enough: for a `pin-conflict`, dropping the pins it
 * names gives a build; for a `pinned-unpriced`, dropping the pinned parts it names (all of them
 * unpriced pins) gives a build of known price; for a `pins` budget failure, dropping the pins
 * it names does.
 */
function namedPinsSuffice(
  c: RecordsCase,
  result: Extract<ReturnType<typeof optimize>, { ok: false }>,
): boolean {
  const pins = c.input.constraints.pinnedSlots;
  let drop: Set<string>;
  if (result.reason === "pin-conflict") {
    return buildsUnder(c, { budget: true, dropPins: new Set(result.paths) }).length > 0;
  }
  if (result.reason === "pinned-unpriced") {
    const unpriced = unpricedPinPaths(c);
    const named = new Set(result.itemIds);
    drop = new Set([...unpriced].filter((path) => named.has(pins.get(path)!)));
    if (result.itemIds.some((id) => ![...drop].some((path) => pins.get(path) === id))) {
      return false;
    }
  } else if (result.reason === "infeasible-budget" && result.cause === "pins") {
    drop = new Set(result.paths);
  } else {
    return true;
  }
  return buildsUnder(c, { budget: true, dropPins: drop }).some((j) => j.unknown === 0);
}

describe("optimize — exact against brute force, from upstream-shaped records", () => {
  // The whole path a Builder run takes: records → buildProblem → refusals → solve → diagnose.
  // Every build of every case is judged by resolveBuild, buildPriceUnder and weaponSpec; the
  // optimizer must return a build exactly as good as the best, or say why none exists with a
  // reason that is true. The timeout is headroom for coverage instrumentation on a shared CI
  // runner, not a performance claim.
  it(`matches every build enumerated on ${CASES} random weapons`, () => {
    const rnd = prng(260);
    const tally = {
      compared: 0,
      feasible: 0,
      infeasible: 0,
      theorycraft: 0,
      budget: 0,
      pins: 0,
      presets: 0,
      accuracy: 0,
    };
    const reasons = new Map<string, number>();
    for (let t = 0; t < CASES; t++) {
      const c = randomRecords(rnd, MAX_BUILDS);
      if (c === null) continue;
      let best: Judged | null = null;
      for (const judged of buildsUnder(c, {})) {
        if (best === null || compareJudged(judged, best) < 0) best = judged;
      }
      const result = optimize(c.input);
      const label = `case ${t}`;
      if (best === null) {
        expect(result.ok, label).toBe(false);
        if (result.ok) continue;
        expect(verdictOf(result), label).toBe(trueVerdict(c));
        expect(namedPinsSuffice(c, result), `${label}: what it names suffices`).toBe(true);
        reasons.set(verdictOf(result), (reasons.get(verdictOf(result)) ?? 0) + 1);
        tally.infeasible++;
      } else {
        expect(result.ok ? "ok" : `${result.reason}`, label).toBe("ok");
        if (!result.ok) continue;
        const mine = judge(c, result.build.attachments);
        expect(mine, label).not.toBeNull();
        expect(compareJudged(mine!, best), label).toBe(0);
        tally.feasible++;
      }
      tally.compared++;
      const { profile, budgetRub, pinnedSlots } = c.input.constraints;
      if (profile === null) tally.theorycraft++;
      if (budgetRub !== undefined) tally.budget++;
      if (pinnedSlots.size > 0) tally.pins++;
      if ((c.input.presets ?? []).length > 0) tally.presets++;
      if (c.input.objective === "max-accuracy") tally.accuracy++;
    }
    // The generator has to reach every kind of case, and every failure reason the oracle can
    // tell apart, for the comparison to mean anything.
    expect(tally.compared).toBeGreaterThan(CASES * 0.8);
    for (const n of Object.values(tally)) expect(n).toBeGreaterThan(20);
    for (const reason of [
      "weapon-unavailable",
      "infeasible-budget/over-budget",
      "infeasible-budget/pins",
      "infeasible-budget/unpriced",
      "pinned-unpriced",
      "pin-conflict",
      "required-slot",
      "no-valid-combinations",
    ]) {
      expect(
        reasons.get(reason) ?? 0,
        `${reason} in ${JSON.stringify([...reasons])}`,
      ).toBeGreaterThan(0);
    }
  }, 120_000);
});
