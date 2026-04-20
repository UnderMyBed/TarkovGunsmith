import { describe, expect, it } from "vitest";
import { buyForEntrySchema } from "./buy-for.js";

describe("buyForEntrySchema", () => {
  it("parses a trader offer", () => {
    const parsed = buyForEntrySchema.parse({
      priceRUB: 10000,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 2,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
    });
    expect(parsed.vendor.__typename).toBe("TraderOffer");
  });

  it("parses a flea market offer", () => {
    const parsed = buyForEntrySchema.parse({
      priceRUB: 5000,
      currency: "RUB",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: 15,
      },
    });
    expect(parsed.vendor.__typename).toBe("FleaMarket");
  });
});
