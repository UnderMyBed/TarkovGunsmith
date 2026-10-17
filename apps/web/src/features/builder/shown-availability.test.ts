import { describe, expect, it } from "vitest";
import type { ItemAvailability } from "@tarkov/data";
import { shownAvailability } from "./shown-availability.js";

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
