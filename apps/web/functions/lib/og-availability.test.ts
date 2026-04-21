import { describe, expect, it } from "vitest";
import { availabilityPillText, type AvailabilityMod } from "./og-availability.js";
import type { PlayerProfile } from "@tarkov/data";

const defaultProfile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 4,
    therapist: 4,
    skier: 4,
    peacekeeper: 4,
    mechanic: 4,
    ragman: 4,
    jaeger: 4,
  },
  flea: true,
};

describe("availabilityPillText", () => {
  it("clamps LL1-accessible mods to the LL2 pill (no LL1 pill in the spec)", () => {
    const mods: AvailabilityMod[] = [
      { id: "a", buyFor: [{ vendor: { normalizedName: "prapor" }, priceRUB: 100 }] },
      { id: "b", buyFor: [{ vendor: { normalizedName: "skier" }, priceRUB: 100 }] },
    ];
    expect(
      availabilityPillText(mods, {
        ...defaultProfile,
        traders: { ...defaultProfile.traders, prapor: 1, skier: 1 },
      }),
    ).toBe("LL2");
  });

  it("returns FLEA when any mod is flea-only", () => {
    const mods: AvailabilityMod[] = [
      { id: "a", buyFor: [{ vendor: { normalizedName: "flea-market" }, priceRUB: 100 }] },
    ];
    expect(availabilityPillText(mods, defaultProfile)).toBe("FLEA");
  });

  it("returns LL4 when a trader-only mod needs LL4", () => {
    const mods: AvailabilityMod[] = [
      {
        id: "a",
        buyFor: [{ vendor: { normalizedName: "peacekeeper" }, priceRUB: 100, minTraderLevel: 4 }],
      },
    ];
    expect(availabilityPillText(mods, defaultProfile)).toBe("LL4");
  });

  it("empty mods → LL2 (no constraints)", () => {
    expect(availabilityPillText([], defaultProfile)).toBe("LL2");
  });
});
