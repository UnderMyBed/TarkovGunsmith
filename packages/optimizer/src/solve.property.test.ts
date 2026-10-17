import { describe, expect, it } from "vitest";
import {
  allBuilds,
  compareScores,
  placedOf,
  prng,
  randomCase,
  scoreBuild,
  type Score,
} from "./__fixtures__/random-problem.js";
import { solve } from "./solve.js";

const CASES = 400;
const MAX_BUILDS = 20_000;

describe("solve — exact against brute force", () => {
  // Every case is enumerated in full and the solver must match the best build exactly: its
  // build valid, its score the oracle's, and its own claimed score the same. The timeout is
  // headroom for coverage instrumentation on a shared CI runner, not a performance claim.
  it(`matches every build enumerated on ${CASES} random problems`, () => {
    const rnd = prng(225);
    const tally = { compared: 0, feasible: 0, infeasible: 0, accuracy: 0, budget: 0, pins: 0 };
    for (let t = 0; t < CASES; t++) {
      const { problem, tree, catalog, accuracy } = randomCase(rnd);
      const builds = allBuilds(problem, MAX_BUILDS);
      if (builds === null) continue;
      let best: Score | null = null;
      for (const build of builds) {
        const score = scoreBuild(problem, build);
        if (score !== null && (best === null || compareScores(score, best) < 0)) best = score;
      }
      const found = solve(problem, tree, catalog, Date.now() + 30_000);
      const label = `case ${t}`;
      if (best === null) {
        expect(found, label).toBeNull();
        tally.infeasible++;
      } else {
        expect(found, label).not.toBeNull();
        const mine = scoreBuild(problem, placedOf(problem, found!.attachments));
        expect(mine, label).not.toBeNull();
        expect(compareScores(mine!, best), label).toBe(0);
        const claimed = {
          rating: problem.rate(found!.point.key, found!.point.stat),
          price: found!.point.price,
          count: found!.point.count,
        };
        expect(compareScores(claimed, best), label).toBe(0);
        tally.feasible++;
      }
      tally.compared++;
      if (accuracy) tally.accuracy++;
      if (problem.budget !== undefined) tally.budget++;
      if (problem.pins.size > 0) tally.pins++;
    }
    // The generator has to reach every kind of case for the comparison to mean anything.
    expect(tally.compared).toBeGreaterThan(CASES * 0.9);
    for (const n of Object.values(tally)) expect(n).toBeGreaterThan(20);
  }, 60_000);
});
