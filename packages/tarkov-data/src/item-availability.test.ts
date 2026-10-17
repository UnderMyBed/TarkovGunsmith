import { describe, expect, it } from "vitest";
import {
  fixtureOfferResolver,
  fixturePartCatalog,
  fixtureWeaponList,
} from "./__test-utils__/fixture-snapshot.js";
import { itemAvailability } from "./item-availability.js";
import type { AttachablePart } from "./queries/parts.js";
import type { PlayerProfile } from "./build-schema.js";
import type { BuyForEntry } from "./queries/shared/buy-for.js";
import { fixtureClient } from "./__fixtures__/client.js";
import type { ItemsDocument } from "./queries/documents.js";

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
): BuyForEntry {
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
): BuyForEntry {
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

function mod(overrides: Partial<AttachablePart> = {}): AttachablePart {
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
    conflictingItems: [],
    conflictingSlotIds: [],
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

  it("reports the lowest minLevel across several unmet trader offers", () => {
    // `unmetTrader.sort(...)` only actually runs its comparator with 2+ entries — every
    // other blocked-by-LL test above has exactly one failing offer.
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("prapor", 4), traderOffer("therapist", 2)] }),
      baseProfile,
    );
    expect(result.available).toBe(false);
    if (!result.available && result.reason === "trader-ll-required") {
      expect(result.traderNormalizedName).toBe("therapist");
      expect(result.minLevel).toBe(2);
    } else {
      expect.unreachable(`expected trader-ll-required, got ${JSON.stringify(result)}`);
    }
  });

  it("basic-mode profile assumes the quest once the offer's LL is met, and names it", () => {
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("mechanic", 1, 500, "gunsmith-part-1")] }),
      baseProfile,
    );
    expect(result).toEqual({
      available: true,
      kind: "trader",
      traderNormalizedName: "mechanic",
      minLevel: 1,
      priceRUB: 500,
      preset: null,
      assumedQuest: "gunsmith-part-1",
    });
  });

  it("basic-mode profile still reports the LL when the quest-gated offer is above it", () => {
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("mechanic", 3, 500, "gunsmith-part-1")] }),
      baseProfile,
    );
    expect(result).toMatchObject({ available: false, reason: "trader-ll-required", minLevel: 3 });
  });

  it("advanced-mode profile without the quest reports quest-required", () => {
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("mechanic", 1, 500, "gunsmith-part-1")] }),
      { ...baseProfile, mode: "advanced", completedQuests: ["something-else"] },
    );
    expect(result).toMatchObject({
      available: false,
      reason: "quest-required",
      questNormalizedName: "gunsmith-part-1",
    });
  });

  it("prefers a path that assumes no quest at an equal price, whichever comes first", () => {
    const gated = traderOffer("mechanic", 1, 500, "gunsmith-part-1");
    const plain = traderOffer("prapor", 1, 500);
    for (const buyFor of [
      [gated, plain],
      [plain, gated],
    ]) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        traderNormalizedName: "prapor",
        assumedQuest: null,
      });
    }
  });

  it("takes a cheaper quest-gated path over a dearer plain one in basic mode", () => {
    const result = itemAvailability(
      mod({
        buyFor: [traderOffer("prapor", 1, 900), traderOffer("mechanic", 1, 500, "gunsmith-part-1")],
      }),
      baseProfile,
    );
    expect(result).toMatchObject({ priceRUB: 500, assumedQuest: "gunsmith-part-1" });
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
    expect(result).toMatchObject({ available: true, assumedQuest: null });
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

describe("itemAvailability — trader-offer edge cases", () => {
  it("reports a fence/unknown-trader offer as untracked and defaults a missing minTraderLevel to 1", () => {
    // Two branches in one: `minTraderLevel ?? 1` (computed before the trader-key check) and
    // `!isTraderKey(traderName)` both need a non-gated trader like "fence". With no other
    // offer on the item, every other accumulator stays empty and `sawFleaPath` never flips
    // true, so the offer surfaces as `untracked-trader` rather than vanishing into
    // `no-sources` — the profile has no level for Fence or Ref, but the offer is real.
    const result = itemAvailability(
      mod({
        buyFor: [
          {
            priceRUB: 500,
            currency: "RUB",
            vendor: {
              __typename: "TraderOffer",
              normalizedName: "fence",
              minTraderLevel: null as unknown as number,
              taskUnlock: null,
              trader: { normalizedName: "fence" },
            },
          },
        ],
      }),
      baseProfile,
    );
    expect(result).toEqual({
      available: false,
      reason: "untracked-trader",
      traderNormalizedName: "fence",
      minLevel: 1,
      payment: "cash",
    });
  });

  it("treats a missing completedQuests list as no completions, even in advanced mode", () => {
    // `(profile.completedQuests ?? []).includes(...)` — every other advanced-mode test in
    // this file sets `completedQuests` explicitly. A profile that predates the field (see
    // `hooks/useProgression.ts`'s legacy-rehydration path) can reach here without one.
    const advancedNoQuestsField: PlayerProfile = { ...baseProfile, mode: "advanced" };
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("mechanic", 1, 500, "gunsmith-part-1")] }),
      advancedNoQuestsField,
    );
    expect(result.available).toBe(false);
    if (!result.available && result.reason === "quest-required") {
      expect(result.questNormalizedName).toBe("gunsmith-part-1");
    } else {
      expect.unreachable(`expected quest-required, got ${JSON.stringify(result)}`);
    }
  });

  it("treats a null priceRUB as worse-than-any-price when picking the cheapest path", () => {
    // `a.priceRUB ?? Infinity` / `b.priceRUB ?? Infinity` are two separate `??` sites (one
    // per sort-comparator operand) — each needs its own null to exercise the fallback.
    const nullFirst = itemAvailability(
      mod({ buyFor: [traderOffer("prapor", 1, null), traderOffer("therapist", 1, 2500)] }),
      baseProfile,
    );
    expect(nullFirst.available).toBe(true);
    if (nullFirst.available && nullFirst.kind === "trader") {
      expect(nullFirst.traderNormalizedName).toBe("therapist");
    }

    const nullSecond = itemAvailability(
      mod({ buyFor: [traderOffer("therapist", 1, 2500), traderOffer("prapor", 1, null)] }),
      baseProfile,
    );
    expect(nullSecond.available).toBe(true);
    if (nullSecond.available && nullSecond.kind === "trader") {
      expect(nullSecond.traderNormalizedName).toBe("therapist");
    }
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
      { ...baseProfile, mode: "advanced", flea: true, level: 5 },
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
      { ...baseProfile, mode: "advanced", flea: true, level: 5 },
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
 * The unit tests above build their offers by hand. This one drives the composed path — the
 * generated snapshot → `snapshotPartCatalog` → `itemAvailability` — over the committed sample of
 * the real upstream document, so a break in the chain that carries upstream's `minLevelForFlea`
 * onto the gate shows up here rather than passing on hand-shaped input. That chain is the
 * thing that was silently broken: the value was parsed and then never read.
 */
describe("flea level gate, composed over the real document shape", () => {
  it("carries upstream minLevelForFlea through to the vendor", async () => {
    const mods = await fixturePartCatalog(fixtureClient());
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
    const mods = await fixturePartCatalog(fixtureClient());
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

describe("itemAvailability — barters and preset offers", () => {
  function barterOffer(
    traderName: string,
    minLevel: number,
    priceRUB: number | null,
    barterId = "b1",
  ): BuyForEntry {
    return {
      priceRUB,
      currency: null,
      vendor: {
        __typename: "TraderBarter",
        normalizedName: traderName,
        minTraderLevel: minLevel,
        taskUnlock: null,
        trader: { normalizedName: traderName },
        barterId,
        offeredCount: 1,
        requiredItems: [],
        costUnavailableReason: priceRUB === null ? "GP coin has no flea price" : null,
      },
    };
  }

  it("satisfies an item through a barter and reports it as one", () => {
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("peacekeeper", 2, 6878), barterOffer("mechanic", 1, 11406)] }),
      baseProfile,
    );
    expect(result).toEqual({
      available: true,
      kind: "barter",
      traderNormalizedName: "mechanic",
      minLevel: 1,
      priceRUB: 11406,
      barterId: "b1",
      preset: null,
      assumedQuest: null,
    });
  });

  it("prefers a priced cash offer over a barter whose cost is unknown", () => {
    const result = itemAvailability(
      mod({ buyFor: [barterOffer("prapor", 1, null), traderOffer("prapor", 1, 50_000)] }),
      baseProfile,
    );
    expect(result).toMatchObject({ available: true, kind: "trader", priceRUB: 50_000 });
  });

  it("reports the trader gate the profile is fewest levels short of, not the lowest level", () => {
    const profile = { ...baseProfile, traders: { ...baseProfile.traders, mechanic: 3 } };
    const result = itemAvailability(
      mod({ buyFor: [traderOffer("prapor", 3), traderOffer("mechanic", 4)] }),
      profile,
    );
    expect(result).toMatchObject({
      reason: "trader-ll-required",
      traderNormalizedName: "mechanic",
      minLevel: 4,
    });
  });

  it("names cash before barter when two gates are equally close", () => {
    const result = itemAvailability(
      mod({ buyFor: [barterOffer("skier", 2, 9000), traderOffer("jaeger", 2)] }),
      baseProfile,
    );
    expect(result).toEqual({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "jaeger",
      minLevel: 2,
      payment: "cash",
      preset: null,
    });
  });

  it("breaks an equal-distance tie by price, then trader, then offer id — never by order", () => {
    const cheap = barterOffer("peacekeeper", 2, 75882, "b-pk");
    const dear = barterOffer("mechanic", 2, 169988, "b-mech");
    const unpriced = barterOffer("jaeger", 2, null, "b-jg");
    for (const buyFor of [
      [dear, unpriced, cheap],
      [cheap, dear, unpriced],
      [unpriced, cheap, dear],
    ]) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        reason: "trader-ll-required",
        traderNormalizedName: "peacekeeper",
      });
    }
    // Same price: trader name decides.
    const a = barterOffer("skier", 2, 1000, "b2");
    const b = barterOffer("skier", 2, 1000, "b1");
    const c = barterOffer("mechanic", 2, 1000, "b3");
    for (const buyFor of [
      [a, b, c],
      [c, b, a],
    ]) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        traderNormalizedName: "mechanic",
      });
    }
  });

  it("breaks an exact price tie among satisfied offers by kind, then trader — never by order", () => {
    // Live shape: the RPK-16 buffer tube sells for 3625 at Mechanic and on the flea.
    const flea = { ...fleaOffer(3625, 1) };
    const mechanic = traderOffer("mechanic", 1, 3625);
    const barter = barterOffer("jaeger", 1, 3625, "b-jg");
    const prapor = traderOffer("prapor", 1, 3625);
    const profile = { ...baseProfile, flea: true };
    for (const buyFor of [
      [flea, barter, prapor, mechanic],
      [prapor, mechanic, barter, flea],
      [barter, flea, mechanic, prapor],
    ]) {
      expect(itemAvailability(mod({ buyFor }), profile)).toMatchObject({
        kind: "trader",
        traderNormalizedName: "mechanic",
      });
    }
    for (const buyFor of [
      [flea, barter],
      [barter, flea],
    ]) {
      expect(itemAvailability(mod({ buyFor }), profile)).toMatchObject({ kind: "barter" });
    }
  });

  it("names the quest alphabetically when quest gates otherwise tie", () => {
    const profile: PlayerProfile = {
      ...baseProfile,
      mode: "advanced",
      traders: { ...baseProfile.traders, mechanic: 2 },
    };
    const q = (name: string) => traderOffer("mechanic", 2, 1000, name);
    for (const buyFor of [
      [q("gunsmith-part-2"), q("gunsmith-part-1")],
      [q("gunsmith-part-1"), q("gunsmith-part-2")],
    ]) {
      expect(itemAvailability(mod({ buyFor }), profile)).toMatchObject({
        reason: "quest-required",
        questNormalizedName: "gunsmith-part-1",
      });
    }
  });

  it("prefers the cheaper quest gate over the alphabetically earlier one", () => {
    const profile: PlayerProfile = {
      ...baseProfile,
      mode: "advanced",
      traders: { ...baseProfile.traders, mechanic: 2 },
    };
    const cheap = traderOffer("mechanic", 2, 1000, "gunsmith-part-2");
    const dear = traderOffer("mechanic", 2, 9000, "gunsmith-part-1");
    for (const buyFor of [
      [dear, cheap],
      [cheap, dear],
    ]) {
      expect(itemAvailability(mod({ buyFor }), profile)).toMatchObject({
        reason: "quest-required",
        questNormalizedName: "gunsmith-part-2",
      });
    }
  });

  it("breaks a satisfied tie between two presets from one trader by offer id", () => {
    // Live shape: Mechanic sells several M4A1 presets at the same loyalty level.
    const viaPreset = (id: string) => ({
      ...traderOffer("mechanic", 1, 109841),
      preset: { id, normalizedName: `preset-${id}` },
    });
    for (const buyFor of [
      [viaPreset("p2"), viaPreset("p1")],
      [viaPreset("p1"), viaPreset("p2")],
    ]) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        kind: "trader",
        preset: { id: "p1" },
      });
    }
  });

  it("names cash before barter whichever order the offers arrive in", () => {
    const cash = traderOffer("jaeger", 2);
    const barter = barterOffer("jaeger", 2, 900);
    for (const buyFor of [
      [cash, barter],
      [barter, cash],
    ]) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        reason: "trader-ll-required",
        payment: "cash",
      });
    }
  });

  it("reports the nearest untracked offer: lowest level, then cash, then cheapest", () => {
    // Live shape: Ref barters several M4A1 presets for GP coins at LL2-LL4, and Fence sells
    // for cash. None of these traders has a level on the profile.
    const refLL4 = barterOffer("ref", 4, null, "b-ref-4");
    const refLL3Dear = barterOffer("ref", 3, 9000, "b-ref-3a");
    const refLL3Cheap = barterOffer("ref", 3, 4000, "b-ref-3b");
    const orders = [
      [refLL4, refLL3Dear, refLL3Cheap],
      [refLL3Cheap, refLL4, refLL3Dear],
      [refLL3Dear, refLL3Cheap, refLL4],
    ];
    for (const buyFor of orders) {
      const result = itemAvailability(mod({ buyFor }), baseProfile);
      expect(result).toEqual({
        available: false,
        reason: "untracked-trader",
        traderNormalizedName: "ref",
        minLevel: 3,
        payment: "barter",
      });
    }
    const fenceLL3 = traderOffer("fence", 3);
    for (const buyFor of orders.map((o) => [...o, fenceLL3])) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        reason: "untracked-trader",
        traderNormalizedName: "fence",
        payment: "cash",
      });
    }
  });

  it("falls back to the offer id when price and trader tie", () => {
    const viaPreset = (id: string) => ({
      ...traderOffer("skier", 2, 1000),
      preset: { id, normalizedName: `preset-${id}` },
    });
    for (const buyFor of [
      [viaPreset("p2"), viaPreset("p1")],
      [viaPreset("p1"), viaPreset("p2")],
    ]) {
      expect(itemAvailability(mod({ buyFor }), baseProfile)).toMatchObject({
        preset: { id: "p1" },
      });
    }
  });

  it("throws on a vendor kind it does not know rather than ignoring the offer", () => {
    const bogus = {
      priceRUB: 1,
      currency: null,
      vendor: { __typename: "Craft", normalizedName: "x" },
    } as unknown as BuyForEntry;
    expect(() => itemAvailability(mod({ buyFor: [bogus] }), baseProfile)).toThrow(
      /unhandled vendor/,
    );
  });

  it("ranks an untracked trader below flea-locked", () => {
    const result = itemAvailability(
      mod({ buyFor: [barterOffer("ref", 3, null), fleaOffer()] }),
      baseProfile,
    );
    expect(result).toEqual({ available: false, reason: "flea-locked" });
  });
});

describe("itemAvailability — captured documents", () => {
  const ll = (n: number): PlayerProfile => ({
    ...baseProfile,
    traders: {
      prapor: n,
      therapist: n,
      skier: n,
      peacekeeper: n,
      mechanic: n,
      ragman: n,
      jaeger: n,
    },
  });

  async function availabilityOf(id: string, profile: PlayerProfile) {
    const client = fixtureClient();
    const [doc, resolve] = await Promise.all([
      client.fetchResource<ItemsDocument>("items"),
      fixtureOfferResolver(client),
    ]);
    const raw = doc.items[id] as { types: string[] };
    return itemAvailability({ types: raw.types, buyFor: resolve(raw) }, profile);
  }

  it("makes the PM reachable at LL1 through its default preset", async () => {
    const weapons = await fixtureWeaponList(fixtureClient());
    const pm = weapons.find((w) => w.id === "5448bd6b4bdc2dfc2f8b4569")!;
    expect(itemAvailability(pm, ll(1))).toEqual({
      available: true,
      kind: "trader",
      traderNormalizedName: "prapor",
      minLevel: 1,
      priceRUB: 12631,
      preset: {
        id: "58414967245977598f1ad391",
        normalizedName: "makarov-pm-9x18pm-pistol-default",
      },
      assumedQuest: null,
    });
  });

  it("makes the M4A1 reachable at LL2 through the cheapest preset barter", async () => {
    const weapons = await fixtureWeaponList(fixtureClient());
    const m4 = weapons.find((w) => w.id === "5447a9cd4bdc2dbd208b4567")!;
    expect(itemAvailability(m4, ll(2))).toEqual({
      available: true,
      kind: "barter",
      traderNormalizedName: "peacekeeper",
      minLevel: 2,
      priceRUB: 60665,
      barterId: "6ad1e61cef48f022220a4ec81",
      preset: {
        id: "5af08cf886f774223c269184",
        normalizedName: "colt-m4a1-556x45-assault-rifle-carbine",
      },
      assumedQuest: null,
    });
    // At LL1 two preset barters are one level away: Peacekeeper's Carbine (60665) and
    // Mechanic's SOPMOD II (142000). The cheaper one is named — not whichever the
    // document lists first, and not the bare receiver's Mechanic LL3.
    expect(itemAvailability(m4, ll(1))).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "peacekeeper",
      minLevel: 2,
      payment: "barter",
      preset: { id: "5af08cf886f774223c269184" },
    });
  });

  it("makes a mod reachable at LL1 through a barter when its cash offer needs LL2", async () => {
    const mods = await fixturePartCatalog(fixtureClient());
    const latch = mods.find((m) => m.id === "56ea7165d2720b6e518b4583")!;
    expect(itemAvailability(latch, ll(1))).toMatchObject({
      available: true,
      kind: "barter",
      traderNormalizedName: "mechanic",
      minLevel: 1,
      priceRUB: 8990,
    });
  });

  it("gates a barter-only scope on its barter's trader level", async () => {
    // ELCAN SpecterDR (FDE): no cash offer anywhere; Mechanic and Peacekeeper barter it at LL2.
    expect(await availabilityOf("57aca93d2459771f2c7e26db", ll(1))).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      minLevel: 2,
      payment: "barter",
    });
    expect(await availabilityOf("57aca93d2459771f2c7e26db", ll(2))).toMatchObject({
      available: true,
      kind: "barter",
      traderNormalizedName: "peacekeeper",
      priceRUB: 44111,
    });
  });

  it("opens the PRS GEN3 stock's quest-gated offer at Peacekeeper LL3 in basic mode only", async () => {
    // Captured: Peacekeeper sells it at LL3 once "I Need More Power" is done; no other offer.
    const mods = await fixturePartCatalog(fixtureClient());
    const prs = mods.find((m) => m.id === "5d44069ca4b9361ebd26fc37")!;
    expect(itemAvailability(prs, ll(3))).toMatchObject({
      available: true,
      kind: "trader",
      traderNormalizedName: "peacekeeper",
      minLevel: 3,
      assumedQuest: "i-need-more-power",
    });
    expect(itemAvailability(prs, ll(2))).toMatchObject({
      available: false,
      reason: "trader-ll-required",
    });
    const advanced: PlayerProfile = { ...ll(3), mode: "advanced" };
    expect(itemAvailability(prs, advanced)).toMatchObject({
      available: false,
      reason: "quest-required",
      questNormalizedName: "i-need-more-power",
    });
    expect(
      itemAvailability(prs, { ...advanced, completedQuests: ["i-need-more-power"] }),
    ).toMatchObject({ available: true, assumedQuest: null });
  });

  it("reports a Ref-only mod as untracked instead of no-sources", async () => {
    const mods = await fixturePartCatalog(fixtureClient());
    const ravage = mods.find((m) => m.id === "6984b82c5aab442620032fe8")!;
    expect(itemAvailability(ravage, ll(4))).toEqual({
      available: false,
      reason: "untracked-trader",
      traderNormalizedName: "ref",
      minLevel: 3,
      payment: "barter",
    });
  });
});

describe("itemAvailability — unlisted flea entries", () => {
  const withFlea: PlayerProfile = { ...baseProfile, flea: true, level: 40 };
  const unlisted = (): BuyForEntry => ({ ...fleaOffer(null), unlisted: true });

  it("reports an unlisted flea-only item as flea-unlisted, not available at an unknown price", () => {
    expect(itemAvailability(mod({ buyFor: [unlisted()] }), withFlea)).toEqual({
      available: false,
      reason: "flea-unlisted",
    });
  });

  it("checks the listing before the player level: more levels would not list it", () => {
    const low: PlayerProfile = { ...withFlea, level: 1 };
    expect(itemAvailability(mod({ buyFor: [unlisted()] }), low)).toEqual({
      available: false,
      reason: "flea-unlisted",
    });
  });

  it("ranks a trader gate above an unlisted flea entry", () => {
    expect(
      itemAvailability(mod({ buyFor: [traderOffer("prapor", 3), unlisted()] }), withFlea),
    ).toMatchObject({ available: false, reason: "trader-ll-required" });
  });

  it("keeps a flea entry whose price is merely unknown obtainable", () => {
    expect(itemAvailability(mod({ buyFor: [fleaOffer(null)] }), withFlea)).toEqual({
      available: true,
      kind: "flea",
      priceRUB: null,
    });
  });
});

describe("itemAvailability — theorycraft (null gate)", () => {
  it("opens every trader gate, quest and untracked trader, and the flea at any level", () => {
    const quest = traderOffer("skier", 4, 300, "some-quest");
    const ref = traderOffer("ref", 3, 100);
    expect(itemAvailability(mod({ buyFor: [quest] }), null)).toMatchObject({
      available: true,
      kind: "trader",
      traderNormalizedName: "skier",
      priceRUB: 300,
    });
    expect(
      itemAvailability(mod({ buyFor: [quest, ref, fleaOffer(5000, 40)] }), null),
    ).toMatchObject({ available: true, traderNormalizedName: "ref", priceRUB: 100 });
    expect(itemAvailability(mod({ buyFor: [fleaOffer(50, 99)] }), null)).toEqual({
      available: true,
      kind: "flea",
      priceRUB: 50,
    });
  });

  it("still treats an unlisted flea entry as no path, and a noFlea item as off the flea", () => {
    const unlisted: BuyForEntry = { ...fleaOffer(null), unlisted: true };
    expect(itemAvailability(mod({ buyFor: [unlisted] }), null)).toEqual({
      available: false,
      reason: "flea-unlisted",
    });
    expect(
      itemAvailability(mod({ types: ["mods", "noFlea"], buyFor: [fleaOffer(10)] }), null),
    ).toEqual({ available: false, reason: "flea-locked" });
  });
});
