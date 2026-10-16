import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBarters, parseBarters } from "./barters.js";
import { fixtureClient } from "../__fixtures__/client.js";

describe("fetchBarters", () => {
  it("validates every captured barter through the real translation merge", async () => {
    const barters = await fetchBarters(fixtureClient());
    expect(barters).toHaveLength(7);
    const pm = barters.find((b) => b.id === "6ad1e5d8ef48f022220a28931");
    // Prapor LL1 sells the PM default preset for one pack of screw nuts.
    expect(pm).toEqual({
      id: "6ad1e5d8ef48f022220a28931",
      trader: "54cb50c76803fa8b248b4571",
      taskUnlock: null,
      minTraderLevel: 1,
      requiredItems: [{ item: "57347c77245977448d35f6e2", count: 1, attributes: {} }],
      offeredItem: { item: "58414967245977598f1ad391", count: 1, attributes: {} },
    });
  });

  it("accepts a fractional required count — Ref prices in GP coins", async () => {
    const barters = await fetchBarters(fixtureClient());
    const ravage = barters.find((b) => b.id === "6ad1e5efef48f022220a37e63");
    expect(ravage?.requiredItems).toEqual([
      { item: "5d235b4d86f7742e017bc88a", count: 6.25, attributes: {} },
    ]);
  });
});

describe("parseBarters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("drops a malformed record and counts it rather than failing the whole document", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const good = {
      id: "b1",
      trader: "t1",
      taskUnlock: null,
      minTraderLevel: 2,
      requiredItems: [{ item: "i1", count: 2, attributes: {} }],
      offeredItem: { item: "i2", count: 1, attributes: {} },
    };
    const parsed = parseBarters([good, { ...good, id: "b2", minTraderLevel: "two" }, null]);
    expect(parsed.map((b) => b.id)).toEqual(["b1"]);
    expect(debug).toHaveBeenCalledWith(expect.stringContaining("dropped 2 malformed barters"));
  });

  it("returns no barters for a non-array document instead of throwing", () => {
    expect(parseBarters({} as unknown as unknown[])).toEqual([]);
  });
});
