import { describe, expect, it } from "vitest";
import type { WeaponListItem } from "@tarkov/data";
import { tinyTree } from "../../test/tiny-tree.js";
import { describeBuildPrice, formatRub, priceBuild, pricesStatus, totalOf } from "./build-price.js";

const names: Record<string, string> = { gun: "M4A1", grip: "Grip", stock: "Stock" };
const nameOf = (id: string) => names[id] ?? id;

describe("describeBuildPrice", () => {
  it("states a total only when every price is known", () => {
    expect(describeBuildPrice({ status: "priced", totalRUB: 82_984, presetId: null }, nameOf)).toBe(
      "₽82,984",
    );
    expect(
      describeBuildPrice(
        { status: "unknown", knownRUB: 29_985, unpriced: ["grip", "stock"], presetId: null },
        nameOf,
      ),
    ).toBe("₽29,985 known; no price for Grip, Stock");
    expect(describeBuildPrice({ status: "unobtainable", missing: ["gun"] }, nameOf)).toBe(
      "Can't be bought: M4A1",
    );
  });
});

describe("totalOf / formatRub", () => {
  it("is the total of a fully priced build, else null", () => {
    expect(totalOf({ status: "priced", totalRUB: 5, presetId: null })).toBe(5);
    expect(totalOf({ status: "unknown", knownRUB: 5, unpriced: ["a"], presetId: null })).toBeNull();
    expect(totalOf(null)).toBeNull();
    expect(formatRub(1_234_567)).toBe("₽1,234,567");
  });
});

describe("pricesStatus", () => {
  it("prefers a table in hand, then the error, else loading", () => {
    const asOf = "2026-10-17T01:50:29.000Z";
    expect(pricesStatus({ data: { asOf }, error: new Error("refresh failed") })).toEqual({
      state: "ready",
      asOf,
    });
    expect(
      pricesStatus({ data: undefined, error: new Error("json.tarkov.dev answered 503") }),
    ).toEqual({ state: "error", message: "json.tarkov.dev answered 503" });
    expect(pricesStatus({ data: undefined, error: null })).toEqual({ state: "loading" });
  });
});

describe("priceBuild", () => {
  const tree = tinyTree("w1", [{ nameId: "muzzle", name: "Muzzle", items: ["m"] }]);
  const weapon = { id: "w1", types: [], buyFor: [] } as unknown as WeaponListItem;

  it("waits for the weapon and a tree of the same weapon", () => {
    expect(priceBuild(null, undefined, tree, {}, new Map(), [])).toBeNull();
    expect(priceBuild(null, weapon, undefined, {}, new Map(), [])).toBeNull();
    expect(priceBuild(null, { ...weapon, id: "w2" }, tree, {}, new Map(), [])).toBeNull();
  });

  it("prices the weapon it is given", () => {
    expect(priceBuild(null, weapon, tree, {}, new Map(), [])).toEqual({
      status: "unobtainable",
      missing: ["w1"],
    });
  });
});
