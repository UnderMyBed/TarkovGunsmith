import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import {
  parseBuilderPrices,
  parseBuilderSnapshot,
  retrySnapshotLoad,
  SnapshotVersionError,
} from "./load.js";

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("parseBuilderSnapshot", () => {
  it("accepts a generated snapshot as served", async () => {
    const { snapshot } = await fixtureSnapshot();
    expect(parseBuilderSnapshot(roundTrip(snapshot))).toEqual(snapshot);
  });

  it("refuses a snapshot of another version with the reload message", async () => {
    const { snapshot } = await fixtureSnapshot();
    const run = () => parseBuilderSnapshot({ ...snapshot, schema: 999 });
    expect(run).toThrow(SnapshotVersionError);
    expect(run).toThrow("Game data was updated. Reload the page.");
    try {
      run();
    } catch (error) {
      expect((error as SnapshotVersionError).found).toBe(999);
    }
  });

  it("refuses anything that is not a snapshot", async () => {
    const { snapshot } = await fixtureSnapshot();
    expect(() => parseBuilderSnapshot(null)).toThrow(/not a JSON object/);
    expect(() => parseBuilderSnapshot([])).toThrow(/not a JSON object/);
    expect(() => parseBuilderSnapshot({ ...snapshot, source: "elsewhere" })).toThrow(
      /unknown source "elsewhere"/,
    );
    expect(() => parseBuilderSnapshot({ ...snapshot, dataAsOf: 1 })).toThrow(/no dataAsOf/);
    expect(() => parseBuilderSnapshot({ ...snapshot, parts: {} })).toThrow(/no parts list/);
    expect(() => parseBuilderSnapshot({ ...snapshot, offers: null })).toThrow(/no offers map/);
    expect(() => parseBuilderSnapshot({ ...snapshot, slots: [] })).toThrow(/no slots map/);
  });
});

describe("parseBuilderPrices", () => {
  it("accepts generated prices as served", async () => {
    const { prices } = await fixtureSnapshot();
    expect(parseBuilderPrices(roundTrip(prices))).toEqual(prices);
  });

  it("refuses a file without a price table", async () => {
    const { prices } = await fixtureSnapshot();
    expect(() => parseBuilderPrices({ ...prices, prices: null })).toThrow(/no price table/);
    expect(() => parseBuilderPrices({ ...prices, prices: { items: {} } })).toThrow(
      /no price table/,
    );
    expect(() => parseBuilderPrices({ ...prices, schema: 0 })).toThrow(SnapshotVersionError);
  });
});

describe("retrySnapshotLoad", () => {
  it("retries three times, but never a snapshot of another version", () => {
    const failure = new Error("network");
    expect([0, 1, 2, 3].map((n) => retrySnapshotLoad(n, failure))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(retrySnapshotLoad(0, new SnapshotVersionError(2))).toBe(false);
  });
});
