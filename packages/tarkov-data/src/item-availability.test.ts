import { describe, expect, it } from "vitest";
import { itemAvailability } from "./item-availability.js";
import type { ModListItem } from "./queries/modList.js";
import type { PlayerProfile } from "./build-schema.js";

const baseProfile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 1,
    therapist: 1,
    skier: 1,
    peacekeeper: 1,
    mechanic: 1,
    ragman: 1,
    jaeger: 1,
  },
  flea: false,
};

function traderOffer(
  traderName: string,
  minLevel: number,
  priceRUB: number | null = 1000,
  taskUnlockName: string | null = null,
): ModListItem["buyFor"][number] {
  return {
    priceRUB,
    currency: "RUB",
    vendor: {
      __typename: "TraderOffer",
      normalizedName: traderName,
      minTraderLevel: minLevel,
      taskUnlock: taskUnlockName ? { id: "x", normalizedName: taskUnlockName } : null,
      trader: { normalizedName: traderName },
    },
  };
}

function fleaOffer(priceRUB: number | null = 2000): ModListItem["buyFor"][number] {
  return {
    priceRUB,
    currency: "RUB",
    vendor: {
      __typename: "FleaMarket",
      normalizedName: "flea-market",
      minPlayerLevel: 15,
    },
  };
}

function mod(overrides: Partial<ModListItem> = {}): ModListItem {
  return {
    id: "m1",
    name: "Test mod",
    shortName: "TM",
    iconLink: "https://assets.tarkov.dev/m1-icon.webp",
    weight: 0.1,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics: 0,
      recoilModifier: 0,
      accuracyModifier: 0,
    },
    buyFor: [traderOffer("prapor", 1)],
    ...overrides,
  };
}

describe("itemAvailability", () => {
  it("returns available trader path when profile LL is high enough", () => {
    const result = itemAvailability(mod(), baseProfile);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.kind).toBe("trader");
      expect(result.traderNormalizedName).toBe("prapor");
    }
  });

  it("returns blocked-by-LL when profile LL is too low", () => {
    const result = itemAvailability(mod({ buyFor: [traderOffer("prapor", 3)] }), baseProfile);
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("trader-ll-required");
      if (result.reason === "trader-ll-required") {
        expect(result.traderNormalizedName).toBe("prapor");
        expect(result.minLevel).toBe(3);
      }
    }
  });

  it("basic-mode profile rejects quest-gated paths even with LL satisfied", () => {
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("mechanic", 1, 500, "gunsmith-part-1")] }),
      baseProfile,
    );
    expect(result.available).toBe(false);
    if (!result.available && result.reason === "quest-required") {
      expect(result.questNormalizedName).toBe("gunsmith-part-1");
    }
  });

  it("advanced-mode profile with completed quest unlocks the path", () => {
    const advanced: PlayerProfile = {
      ...baseProfile,
      mode: "advanced",
      completedQuests: ["gunsmith-part-1"],
    };
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("mechanic", 1, 500, "gunsmith-part-1")] }),
      advanced,
    );
    expect(result.available).toBe(true);
  });

  it("skips flea path when item is noFlea blacklisted even if profile.flea=true", () => {
    const result = itemAvailability(mod({ types: ["mods", "noFlea"], buyFor: [fleaOffer(5000)] }), {
      ...baseProfile,
      flea: true,
    });
    expect(result.available).toBe(false);
    expect(result.available ? null : result.reason).toBe("flea-locked");
  });

  it("uses flea path when profile has flea access", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000)] }), {
      ...baseProfile,
      flea: true,
    });
    expect(result.available).toBe(true);
    if (result.available) expect(result.kind).toBe("flea");
  });

  it("returns flea-locked when only path is flea and profile.flea=false", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000)] }), baseProfile);
    expect(result.available).toBe(false);
    expect(result.available ? null : result.reason).toBe("flea-locked");
  });

  it("picks cheapest satisfying path across multiple", () => {
    const result = itemAvailability(
      mod({
        buyFor: [
          traderOffer("prapor", 1, 5000),
          traderOffer("therapist", 1, 2500),
          fleaOffer(10_000),
        ],
      }),
      { ...baseProfile, flea: true },
    );
    expect(result.available).toBe(true);
    if (result.available && result.kind === "trader") {
      expect(result.traderNormalizedName).toBe("therapist");
      expect(result.priceRUB).toBe(2500);
    }
  });

  it("returns no-sources when buyFor is empty or null", () => {
    const r1 = itemAvailability(mod({ buyFor: [] }), baseProfile);
    expect(r1.available).toBe(false);
    if (!r1.available) expect(r1.reason).toBe("no-sources");

    const r2 = itemAvailability(mod({ buyFor: null as unknown as [] }), baseProfile);
    expect(r2.available).toBe(false);
    if (!r2.available) expect(r2.reason).toBe("no-sources");
  });
});

describe("itemAvailability — weapon shape", () => {
  // Sanity check: a WeaponListItem-shaped object satisfies AvailabilityInput
  // and returns the expected trader path.
  it("evaluates a weapon's trader offer like any other item", () => {
    const weapon = {
      buyFor: [
        {
          priceRUB: 43000,
          currency: "RUB",
          vendor: {
            __typename: "TraderOffer" as const,
            normalizedName: "peacekeeper",
            minTraderLevel: 1,
            taskUnlock: null,
            trader: { normalizedName: "peacekeeper" },
          },
        },
      ],
      types: ["weapon"],
    };
    const result = itemAvailability(weapon, baseProfile);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.kind).toBe("trader");
    }
  });
});
