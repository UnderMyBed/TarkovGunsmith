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

/**
 * The one reason that is true of a case with no build:
 *
 * - the weapon, when no way to buy it is open;
 * - the budget, when a build exists without it. Its cause is the pins when no build without
 *   it has a known price, but one does once the pinned parts nobody prices are unpinned; the
 *   budget itself otherwise (a gun over the budget or of unknown price, a build of known
 *   price, or a part nobody pinned that has no price on every build);
 * - else the pins, when a build exists without them;
 * - else a required slot, when none exists even with conflicts ignored;
 * - else conflicts.
 */
function trueReason(c: RecordsCase): OptimizationReason {
  if (weaponUnobtainable(c)) return "weapon-unavailable";
  const { budgetRub, pinnedSlots } = c.input.constraints;
  if (budgetRub !== undefined) {
    const free = buildsUnder(c, { budget: true });
    if (free.length > 0) {
      const gun = weaponPrice(c);
      if (gun === null || gun > budgetRub || free.some((j) => j.unknown === 0)) {
        return "infeasible-budget";
      }
      const unpinned = buildsUnder(c, { budget: true, dropPins: unpricedPinPaths(c) });
      return unpinned.some((j) => j.unknown === 0) ? "pinned-unpriced" : "infeasible-budget";
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
        expect(result.reason, label).toBe(trueReason(c));
        reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
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
      "infeasible-budget",
      "pinned-unpriced",
      "pin-conflict",
      "required-slot",
      "no-valid-combinations",
    ]) {
      expect(reasons.get(reason) ?? 0, reason).toBeGreaterThan(0);
    }
  }, 120_000);
});
