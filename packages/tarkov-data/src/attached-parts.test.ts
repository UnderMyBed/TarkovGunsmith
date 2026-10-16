import { describe, expect, it } from "vitest";
import { attachedParts, fleaPriceRub } from "./attached-parts.js";
import { fetchPartCatalog, partsById } from "./queries/parts.js";
import { fixtureClient } from "./__fixtures__/client.js";

const STANAG_MAG = "55d4887d4bdc2d962f8b4570";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";

describe("attachedParts", () => {
  it("returns one entry per slot, so a part in two slots counts twice", async () => {
    const byId = partsById(await fetchPartCatalog(fixtureClient()));
    const { entries, missing } = attachedParts(
      { mod_magazine: STANAG_MAG, "mod_x/mod_magazine": STANAG_MAG, mod_barrel: BARREL_10_3 },
      byId,
    );
    expect(entries.map((e) => [e.path, e.part.id])).toEqual([
      ["mod_magazine", STANAG_MAG],
      ["mod_x/mod_magazine", STANAG_MAG],
      ["mod_barrel", BARREL_10_3],
    ]);
    expect(missing).toEqual([]);
  });

  it("reports each attachment the catalog cannot resolve", async () => {
    const byId = partsById(await fetchPartCatalog(fixtureClient()));
    const { entries, missing } = attachedParts({ a: "gone", b: "gone", c: STANAG_MAG }, byId);
    expect(entries).toHaveLength(1);
    expect(missing).toEqual([
      { path: "a", itemId: "gone" },
      { path: "b", itemId: "gone" },
    ]);
  });
});

describe("fleaPriceRub", () => {
  it("reads the flea offer, and 0 without one", async () => {
    const parts = await fetchPartCatalog(fixtureClient());
    const withFlea = parts.find((p) =>
      (p.buyFor ?? []).some((b) => b.vendor.__typename === "FleaMarket" && b.priceRUB !== null),
    )!;
    const flea = withFlea.buyFor!.find((b) => b.vendor.__typename === "FleaMarket")!;
    expect(fleaPriceRub(withFlea)).toBe(flea.priceRUB);
    expect(fleaPriceRub({ ...withFlea, buyFor: [] })).toBe(0);
  });
});
