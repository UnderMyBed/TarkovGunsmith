import { describe, expect, it } from "vitest";
import { isProfileTrader } from "./traders.js";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";

describe("isProfileTrader", () => {
  it("keeps the 7 loyalty-gated traders and leaves out Ref and Fence", async () => {
    const { snapshot } = await fixtureSnapshot();
    const names = snapshot.traders.map((t) => t.normalizedName);
    expect(names).toEqual(expect.arrayContaining(["prapor", "jaeger", "ref", "fence"]));
    expect(
      snapshot.traders
        .filter(isProfileTrader)
        .map((t) => t.normalizedName)
        .sort(),
    ).toEqual(["jaeger", "mechanic", "peacekeeper", "prapor", "ragman", "skier", "therapist"]);
  });
});
