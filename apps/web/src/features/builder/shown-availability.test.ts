import { describe, expect, it } from "vitest";
import type { ItemAvailability } from "@tarkov/data";
import { availabilityLabel, shownAvailability } from "./shown-availability.js";

const NO_SOURCES: ItemAvailability = { available: false, reason: "no-sources" };
const ON_FLEA: ItemAvailability = { available: true, kind: "flea", priceRUB: 4_500 };

describe("shownAvailability", () => {
  it("hides only what is unavailable, and only in theorycraft", () => {
    expect(shownAvailability("theorycraft", NO_SOURCES)).toBeNull();
    expect(shownAvailability("theorycraft", ON_FLEA)).toBe(ON_FLEA);
    expect(shownAvailability("theorycraft", null)).toBeNull();
    expect(shownAvailability("progression", NO_SOURCES)).toBe(NO_SOURCES);
  });
});

describe("availabilityLabel", () => {
  const trader = {
    available: true,
    traderNormalizedName: "peacekeeper",
    minLevel: 3,
    priceRUB: 54_515,
    preset: null,
    assumedQuest: null,
  } as const;

  it("names the path: trader level, barter, or flea", () => {
    expect(availabilityLabel({ ...trader, kind: "trader" })).toBe("LL3");
    expect(availabilityLabel({ ...trader, kind: "barter", minLevel: 1, barterId: "b1" })).toBe(
      "LL1 barter",
    );
    expect(availabilityLabel(ON_FLEA)).toBe("Flea");
  });

  it("says quest when the path assumes one is done", () => {
    const assumed = { ...trader, assumedQuest: "i-need-more-power" };
    expect(availabilityLabel({ ...assumed, kind: "trader" })).toBe("LL3 · quest");
    expect(availabilityLabel({ ...assumed, kind: "barter", barterId: "b1" })).toBe(
      "LL3 barter · quest",
    );
  });

  it("reads Locked for anything with no open path", () => {
    expect(availabilityLabel(NO_SOURCES)).toBe("Locked");
    expect(availabilityLabel({ available: false, reason: "flea-locked" })).toBe("Locked");
  });
});
