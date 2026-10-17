import { describe, expect, it } from "vitest";
import {
  compareJudged,
  judge,
  randomRecords,
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

/** Whether some build passes the Builder's rules once `relax` lifts some of them. */
function someBuild(c: RecordsCase, relax: Relax): boolean {
  return c.builds.some((b) => {
    const judged = judge(c, b, relax);
    return judged !== null && judged !== "pinned";
  });
}

/**
 * The reasons that are true of a case with no build: the budget when one exists without it,
 * else the pins when one exists without them, else a required slot when none exists even
 * with conflicts ignored, else conflicts.
 */
function trueReasons(c: RecordsCase): readonly OptimizationReason[] {
  if (weaponUnobtainable(c)) return ["weapon-unavailable"];
  const { budgetRub, pinnedSlots } = c.input.constraints;
  if (budgetRub !== undefined && someBuild(c, { budget: true })) {
    return ["infeasible-budget", "pinned-unpriced"];
  }
  if (pinnedSlots.size > 0 && someBuild(c, { budget: true, pins: true })) return ["pin-conflict"];
  if (!someBuild(c, { budget: true, pins: true, conflicts: true })) return ["required-slot"];
  return ["no-valid-combinations"];
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
      let pinned = false;
      for (const build of c.builds) {
        const judged = judge(c, build);
        if (judged === "pinned") pinned = true;
        else if (judged !== null && (best === null || compareJudged(judged, best) < 0)) {
          best = judged;
        }
      }
      // A pinned part the profile cannot buy is placed at an unknown price, which the oracle's
      // price rule cannot express; such cases are left to the unit tests.
      if (pinned) continue;
      const result = optimize(c.input);
      const label = `case ${t}`;
      if (best === null) {
        expect(result.ok, label).toBe(false);
        if (result.ok) continue;
        expect(trueReasons(c), `${label}: ${result.reason}`).toContain(result.reason);
        reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
        tally.infeasible++;
      } else {
        expect(result.ok ? "ok" : `${result.reason}`, label).toBe("ok");
        if (!result.ok) continue;
        const mine = judge(c, result.build.attachments);
        expect(mine, label).not.toBeNull();
        expect(mine, label).not.toBe("pinned");
        expect(compareJudged(mine as Judged, best), label).toBe(0);
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
      "pin-conflict",
      "required-slot",
      "no-valid-combinations",
    ]) {
      expect(reasons.get(reason) ?? 0, reason).toBeGreaterThan(0);
    }
  }, 120_000);
});
