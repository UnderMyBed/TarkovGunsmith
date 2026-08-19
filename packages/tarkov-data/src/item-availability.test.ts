import { describe, expect, it } from "vitest";
import { itemAvailability } from "./item-availability.js";
import type { ModListItem } from "./queries/modList.js";
import type { PlayerProfile } from "./build-schema.js";
import { fetchModList } from "./queries/modList.js";
import { fixtureClient } from "./__fixtures__/client.js";

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
  // Matches DEFAULT_PROFILE. Every profile that reaches itemAvailability in production
  // has been through PlayerProfile.parse, so it always carries a level.
  level: 1,
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

function fleaOffer(
  priceRUB: number | null = 2000,
  minPlayerLevel: number | null = 15,
): ModListItem["buyFor"][number] {
  return {
    priceRUB,
    currency: "RUB",
    vendor: {
      __typename: "FleaMarket",
      normalizedName: "flea-market",
      minPlayerLevel,
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
      propertiesType: "ItemPropertiesWeaponMod",
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

  it("uses flea path when profile has flea access and clears the level gate", () => {
    // fleaOffer() has always carried minPlayerLevel: 15. Before the gate existed that
    // number was inert, so this test passed at level 1. It now needs a real level —
    // the change in this assertion is the gate proving itself.
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000)] }), {
      ...baseProfile,
      flea: true,
      level: 15,
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
      { ...baseProfile, flea: true, level: 20 },
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

describe("itemAvailability — flea player-level gate", () => {
  const fleaProfile: PlayerProfile = { ...baseProfile, flea: true };

  it("blocks a flea offer when the profile level is below minPlayerLevel", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000, 20)] }), {
      ...fleaProfile,
      level: 19,
    });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("flea-level-required");
      if (result.reason === "flea-level-required") {
        expect(result.minPlayerLevel).toBe(20);
      }
    }
  });

  it("allows the flea offer at exactly minPlayerLevel", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000, 20)] }), {
      ...fleaProfile,
      level: 20,
    });
    expect(result.available).toBe(true);
    if (result.available) expect(result.kind).toBe("flea");
  });

  it("treats minPlayerLevel 0 and null as no requirement", () => {
    for (const min of [0, null] as const) {
      const result = itemAvailability(mod({ buyFor: [fleaOffer(3000, min)] }), {
        ...fleaProfile,
        level: 1,
      });
      expect(result.available).toBe(true);
    }
  });

  it("reports the lowest gate when several flea paths fail", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000, 25), fleaOffer(9000, 20)] }), {
      ...fleaProfile,
      level: 5,
    });
    expect(result.available).toBe(false);
    if (!result.available && result.reason === "flea-level-required") {
      expect(result.minPlayerLevel).toBe(20);
    }
  });

  it("falls through to a satisfiable trader path rather than reporting the level gate", () => {
    const result = itemAvailability(
      mod({ buyFor: [fleaOffer(500, 25), traderOffer("prapor", 1, 9000)] }),
      { ...fleaProfile, level: 5 },
    );
    expect(result.available).toBe(true);
    if (result.available && result.kind === "trader") {
      expect(result.traderNormalizedName).toBe("prapor");
    }
  });
});

describe("itemAvailability — unmet-requirement precedence", () => {
  // With profile.flea === true, reporting "you have no flea access" would be a lie.
  it("reports the level gate, not flea-locked, when the player HAS flea access", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000, 20)] }), {
      ...baseProfile,
      flea: true,
      level: 5,
    });
    expect(result.available ? null : result.reason).toBe("flea-level-required");
  });

  // No flea access at all is the blunter, earlier blocker — level never enters into it.
  it("reports flea-locked, not the level gate, when the player has no flea access", () => {
    const result = itemAvailability(mod({ buyFor: [fleaOffer(3000, 20)] }), {
      ...baseProfile,
      flea: false,
      level: 5,
    });
    expect(result.available ? null : result.reason).toBe("flea-locked");
  });

  // A single targeted quest is more accessible than a multi-level grind.
  it("reports the quest ahead of the flea level gate", () => {
    const result = itemAvailability(
      mod({
        buyFor: [fleaOffer(3000, 20), traderOffer("mechanic", 1, 500, "gunsmith-master-part-1")],
      }),
      { ...baseProfile, flea: true, level: 5 },
    );
    expect(result.available ? null : result.reason).toBe("quest-required");
  });

  it("reports the trader LL ahead of the flea level gate", () => {
    const result = itemAvailability(
      mod({ buyFor: [fleaOffer(3000, 20), traderOffer("prapor", 3, 500)] }),
      { ...baseProfile, flea: true, level: 5 },
    );
    expect(result.available ? null : result.reason).toBe("trader-ll-required");
  });

  it("reports the trader LL ahead of the quest, unchanged by the new variant", () => {
    const result = itemAvailability(
      mod({
        buyFor: [
          traderOffer("prapor", 3, 500),
          traderOffer("mechanic", 1, 500, "gunsmith-master-part-1"),
        ],
      }),
      { ...baseProfile, flea: true, level: 5 },
    );
    expect(result.available ? null : result.reason).toBe("trader-ll-required");
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

/**
 * The unit tests above build their offers by hand. This one drives the composed path —
 * `fetchModList` → `resolveBuyFor` → `itemAvailability` — over the committed sample of the
 * real upstream document, so a break in the chain that carries upstream's `minLevelForFlea`
 * onto the gate shows up here rather than passing on hand-shaped input. That chain is the
 * thing that was silently broken: the value was parsed and then never read.
 */
describe("flea level gate, composed over the real document shape", () => {
  it("carries upstream minLevelForFlea through to the vendor", async () => {
    const mods = await fetchModList(fixtureClient());
    const gatedFleaLevels = mods
      .flatMap((m) => m.buyFor ?? [])
      .filter((b) => b.vendor.__typename === "FleaMarket")
      .map((b) => (b.vendor.__typename === "FleaMarket" ? b.vendor.minPlayerLevel : null))
      .filter((lvl): lvl is number => lvl !== null && lvl > 0);

    // Fails loudly rather than passing vacuously if the sample ever loses its gated items.
    expect(gatedFleaLevels.length, "sample has no flea-gated mods left").toBeGreaterThan(0);
    // Live upstream uses 0 | 20 | 25 | 30 | 40; anything else means the mapping mangled it.
    for (const lvl of gatedFleaLevels) expect([20, 25, 30, 35, 40]).toContain(lvl);
  });

  it("gates a real gated mod below its level and releases it at the level", async () => {
    const mods = await fetchModList(fixtureClient());
    const gated = mods.find((m) =>
      (m.buyFor ?? []).some(
        (b) => b.vendor.__typename === "FleaMarket" && (b.vendor.minPlayerLevel ?? 0) >= 20,
      ),
    );
    expect(gated, "sample has no flea-gated mod").toBeDefined();

    const fleaOffer = (gated!.buyFor ?? []).find((b) => b.vendor.__typename === "FleaMarket")!;
    const gate =
      fleaOffer.vendor.__typename === "FleaMarket" ? (fleaOffer.vendor.minPlayerLevel ?? 0) : 0;

    // Isolating the flea path deliberately, and this is the one hand-shaped step: no mod in
    // the sample is flea-only, and every trader offer on a gated mod is itself unmet for a
    // level-1 profile. `trader-ll-required` outranks the flea gate by design, so leaving the
    // trader offers in would assert the precedence rule rather than the gate. The vendor
    // object itself is still the real one `resolveBuyFor` produced from the document.
    const fleaOnly = { ...gated!, buyFor: [fleaOffer] };

    const below = itemAvailability(fleaOnly, { ...baseProfile, flea: true, level: gate - 1 });
    expect(below.available).toBe(false);
    if (!below.available && below.reason === "flea-level-required") {
      expect(below.minPlayerLevel).toBe(gate);
    } else {
      expect.unreachable(`expected flea-level-required, got ${JSON.stringify(below)}`);
    }

    const atGate = itemAvailability(fleaOnly, { ...baseProfile, flea: true, level: gate });
    expect(atGate.available).toBe(true);
    if (atGate.available) expect(atGate.kind).toBe("flea");
  });
});
