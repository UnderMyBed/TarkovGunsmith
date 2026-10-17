import { describe, expect, it } from "vitest";
import type { PricedPreset, WeaponListItem } from "@tarkov/data";
import { tinyTree } from "../../test/tiny-tree.js";
import {
  coversOf,
  buildPriceParts,
  describeBuildPrice,
  formatRub,
  priceBuild,
  pricesStatus,
  totalOf,
} from "./build-price.js";

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

  it("says when another way to buy the build, with a price not known, may cost less", () => {
    expect(
      describeBuildPrice(
        {
          status: "priced",
          totalRUB: 55_000,
          presetId: "p-default",
          cheaperUnpriced: { presetId: null, knownRUB: 38_000, unpriced: ["grip"] },
        },
        nameOf,
      ),
    ).toBe("₽55,000; may cost less bought another way (no price for Grip)");
  });
});

describe("buildPriceParts", () => {
  it("splits the rouble figure from the words around it", () => {
    expect(buildPriceParts({ status: "priced", totalRUB: 82_984, presetId: null }, nameOf)).toEqual(
      { figure: "₽82,984", note: null },
    );
    expect(
      buildPriceParts(
        {
          status: "priced",
          totalRUB: 55_000,
          presetId: "p-default",
          cheaperUnpriced: { presetId: null, knownRUB: 38_000, unpriced: ["grip"] },
        },
        nameOf,
      ),
    ).toEqual({
      figure: "₽55,000",
      note: "May cost less bought another way (no price for Grip)",
    });
    expect(
      buildPriceParts(
        { status: "unknown", knownRUB: 29_985, unpriced: ["grip", "stock"], presetId: null },
        nameOf,
      ),
    ).toEqual({ figure: "₽29,985+", note: "Known so far; no price for Grip, Stock" });
    expect(buildPriceParts({ status: "unobtainable", missing: ["gun"] }, nameOf)).toEqual({
      figure: null,
      note: "Can't be bought: M4A1",
    });
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

describe("coversOf", () => {
  const preset = {
    id: "p",
    attachments: { a: "stock", b: "grip", c: "stock" },
  } as unknown as PricedPreset;

  it("counts the parts of the preset the build is bought as", () => {
    expect([...coversOf({ status: "priced", totalRUB: 1, presetId: "p" }, [preset])]).toEqual([
      ["stock", 2],
      ["grip", 1],
    ]);
  });

  it("is empty for the receiver, no path, or no price yet", () => {
    expect(coversOf({ status: "priced", totalRUB: 1, presetId: null }, [preset]).size).toBe(0);
    expect(coversOf({ status: "unobtainable", missing: ["w"] }, [preset]).size).toBe(0);
    expect(coversOf(null, [preset]).size).toBe(0);
    expect(coversOf({ status: "priced", totalRUB: 1, presetId: "gone" }, [preset]).size).toBe(0);
  });
});
