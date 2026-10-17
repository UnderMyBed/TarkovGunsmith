import { describe, expect, it } from "vitest";
import {
  buildPriceUnder,
  DEFAULT_PROFILE,
  itemAvailability,
  priceGate,
  snapshotPartCatalog,
  snapshotWeaponList,
  type AvailabilityInput,
  type BuyForEntry,
  type PlayerProfile,
} from "@tarkov/data";
import { capturedBuilderData } from "../../src/test/captured-data.js";
import {
  availabilityLabel,
  shownAvailability,
} from "../../src/features/builder/shown-availability.js";
import { availabilityPill } from "./og-availability.js";
import { fetchOgRowsForBuild } from "./og-graphql.js";

// ---------- Upstream-shaped offers (values in the range json.tarkov.dev returns) ----------

function cash(trader: string, minTraderLevel: number, priceRUB: number | null, quest?: string) {
  return {
    priceRUB,
    currency: "RUB",
    vendor: {
      __typename: "TraderOffer",
      normalizedName: trader,
      minTraderLevel,
      taskUnlock: quest === undefined ? null : { id: null, normalizedName: quest },
      trader: { normalizedName: trader },
    },
  } as BuyForEntry;
}

function barter(trader: string, minTraderLevel: number, priceRUB: number | null) {
  return {
    priceRUB,
    currency: null,
    vendor: {
      __typename: "TraderBarter",
      normalizedName: trader,
      minTraderLevel,
      taskUnlock: null,
      trader: { normalizedName: trader },
      barterId: `${trader}-${minTraderLevel}`,
      offeredCount: 1,
      requiredItems: [{ itemId: "nuts", count: 4, attributes: {} }],
      costUnavailableReason: priceRUB === null ? "nuts: no flea price" : null,
    },
  } as BuyForEntry;
}

function flea(priceRUB: number | null, minPlayerLevel = 15) {
  return {
    priceRUB,
    currency: "RUB",
    vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel },
  } as BuyForEntry;
}

const item = (...buyFor: BuyForEntry[]): AvailabilityInput => ({ buyFor, types: ["mods"] });

/** The card's pill for a weapon and parts, priced as the card prices them. */
function pill(
  gate: PlayerProfile | null,
  weapon: AvailabilityInput,
  ...parts: AvailabilityInput[]
) {
  const withIds = (x: AvailabilityInput, id: string) => ({ ...x, id });
  const price = buildPriceUnder(gate, {
    weapon: withIds(weapon, "weapon"),
    parts: parts.map((p, i) => withIds(p, `part-${i}`)),
  });
  return availabilityPill(gate, { weapon, parts }, price);
}

const LL4: PlayerProfile = {
  ...DEFAULT_PROFILE,
  traders: {
    prapor: 4,
    therapist: 4,
    skier: 4,
    peacekeeper: 4,
    mechanic: 4,
    ragman: 4,
    jaeger: 4,
  },
};

describe("availabilityPill", () => {
  it("names the highest trader level any path needs, LL1 included", () => {
    expect(pill(null, item(cash("prapor", 1, 20_000)))).toBe("LL1");
    expect(pill(null, item(cash("prapor", 1, 20_000)), item(cash("skier", 3, 4_000)))).toBe("LL3");
  });

  it("says BARTER, FLEA and QUEST when a path is one, in the Builder's words", () => {
    const gun = item(cash("mechanic", 2, 30_000));
    expect(pill(null, gun, item(barter("prapor", 3, 6_000)))).toBe("LL3 BARTER");
    expect(pill(null, gun, item(flea(9_000)))).toBe("LL2 · FLEA");
    expect(pill(LL4, gun, item(cash("peacekeeper", 3, 5_000, "gunsmith-part-4")))).toBe(
      "LL3 · QUEST",
    );
    expect(pill(null, item(flea(31_000)))).toBe("FLEA");
  });

  it("reads LOCKED when the profile cannot buy the build", () => {
    const gun = item(cash("mechanic", 2, 30_000));
    expect(pill(DEFAULT_PROFILE, gun)).toBe("LOCKED");
    // A part with no offer at all, or only on a flea the profile has no access to.
    expect(pill(LL4, gun, item())).toBe("LOCKED");
    expect(pill(LL4, gun, item(flea(9_000)))).toBe("LOCKED");
    // Ref is a trader no profile tracks: Ref-only reads as locked under one.
    expect(pill(LL4, gun, item(barter("ref", 3, null)))).toBe("LOCKED");
  });

  it("in theorycraft, shows a part nobody sells as nothing, not as gated", () => {
    const gun = item(cash("mechanic", 2, 30_000));
    expect(pill(null, gun, item())).toBe("LL2");
    expect(pill(null, gun, item({ ...flea(null), unlisted: true }))).toBe("LL2");
    // Ref is open in theorycraft, by its own level.
    expect(pill(null, gun, item(barter("ref", 3, null)))).toBe("LL3 BARTER");
    // Nothing to show at all: no pill, never an invented one.
    expect(pill(null, item(), item())).toBeNull();
  });

  it("does not lock a part the preset bought supplies", () => {
    const gun = item({
      ...cash("mechanic", 2, 40_000),
      preset: { id: "preset", normalizedName: "preset" },
    });
    const unsold = { ...item(), id: "part" };
    const price = buildPriceUnder(LL4, {
      weapon: { ...gun, id: "weapon" },
      parts: [unsold],
      presets: [{ id: "preset", attachments: { mod_stock: "part" } }],
    });
    expect(price.status).toBe("priced");
    expect(availabilityPill(LL4, { weapon: gun, parts: [unsold] }, price)).toBe("LL2");
  });
});

// ---------- Parity with the Builder over the captured game data ----------

/** What the Builder's pill says for one item: `useBuilderState`'s gate, `ModsPanel`'s filter. */
function builderPill(item: AvailabilityInput, profile: PlayerProfile | undefined): string | null {
  const mode = profile === undefined ? "theorycraft" : "progression";
  const shown = shownAvailability(
    mode,
    itemAvailability(item, priceGate(mode, profile ?? DEFAULT_PROFILE)),
  );
  return shown === null ? null : availabilityLabel(shown);
}

const M4A1 = "5447a9cd4bdc2dbd208b4567";
/** Buffer tube on the M4A1's stock slot; the two stocks below sit on it. */
const BUFFER_TUBE = "5649be884bdc2d79388b4577";
/** Magpul PRS GEN3: Peacekeeper LL3 behind "I Need More Power", and on the flea. */
const PRS_GEN3 = "5d44069ca4b9361ebd26fc37";
/** LSA Ravage stock: one Ref barter, nothing else. */
const RAVAGE = "6984b82c5aab442620032fe8";
/** LSA Ravage stock (Red): nobody sells it. */
const RAVAGE_RED = "6985ec9fc848f05f4600f6b9";

const NO_FLEA_LL4: PlayerProfile = LL4;
const ADVANCED_LL4: PlayerProfile = { ...LL4, mode: "advanced", completedQuests: [] };
const PROFILES: Array<PlayerProfile | undefined> = [
  undefined,
  DEFAULT_PROFILE,
  NO_FLEA_LL4,
  ADVANCED_LL4,
  { ...LL4, flea: true, level: 30 },
];

describe("the card's pill against the Builder's, over the captured records", () => {
  const cases = [
    // A bare weapon: its own offers count. Production printed LL2 for this (#254).
    { name: "bare M4A1", attachments: {} },
    { name: "with a buffer tube", attachments: { mod_stock: BUFFER_TUBE } },
    {
      name: "with a quest-gated stock",
      attachments: { mod_stock: BUFFER_TUBE, "mod_stock/mod_stock_000": PRS_GEN3 },
    },
    {
      name: "with a barter-only stock",
      attachments: { mod_stock: BUFFER_TUBE, "mod_stock/mod_stock_003": RAVAGE },
    },
    {
      name: "with a stock nobody sells",
      attachments: { mod_stock: BUFFER_TUBE, "mod_stock/mod_stock_003": RAVAGE_RED },
    },
  ];
  /** Rows: theorycraft, a fresh profile, LL4 without flea, LL4 advanced, LL4 with flea at 30. */
  const expected: Record<string, Array<string | null>> = {
    "bare M4A1": ["LL3", "LOCKED", "LL3", "LL3", "LL3"],
    "with a buffer tube": ["LL3", "LOCKED", "LL3", "LL3", "LL3"],
    // Theorycraft and the flea profile buy the stock on the flea, where it is cheaper; LL4
    // without flea gets it from Peacekeeper, assuming the quest; advanced mode lacks it.
    "with a quest-gated stock": ["LL3 · FLEA", "LOCKED", "LL3 · QUEST", "LOCKED", "LL3 · FLEA"],
    // Ref is open in theorycraft only: no profile tracks a level for him.
    "with a barter-only stock": ["LL3 BARTER", "LOCKED", "LOCKED", "LOCKED", "LOCKED"],
    // Theorycraft does not show a part nobody sells as gated.
    "with a stock nobody sells": ["LL3", "LOCKED", "LOCKED", "LOCKED", "LOCKED"],
  };

  it.each(cases)(
    "prints the Builder's verdict for a build $name",
    async ({ name, attachments }) => {
      const data = await capturedBuilderData();
      const pills = PROFILES.map(
        (profile) =>
          fetchOgRowsForBuild({ weaponId: M4A1, attachments, gate: profile ?? null }, data)
            .availability,
      );
      expect(pills).toEqual(expected[name]);
    },
  );

  it("agrees with each item's Builder pill: the weapon, and the stocks under their tube", async () => {
    const data = await capturedBuilderData();
    const table = data.prices.prices;
    const weapon = snapshotWeaponList(data.snapshot, table).find((w) => w.id === M4A1)!;
    const parts = new Map(snapshotPartCatalog(data.snapshot, table).map((p) => [p.id, p]));
    const builder = (id: string) =>
      PROFILES.map((p) => builderPill(id === M4A1 ? weapon : parts.get(id)!, p));
    // The bare weapon's card is its Builder pill exactly.
    expect(builder(M4A1)).toEqual(expected["bare M4A1"]);
    expect(builder(BUFFER_TUBE)).toEqual(["LL2", "LOCKED", "LL2", "LL2", "LL2"]);
    expect(builder(PRS_GEN3)).toEqual(["FLEA", "LOCKED", "LL3 · QUEST", "LOCKED", "FLEA"]);
    expect(builder(RAVAGE)).toEqual(["LL3 BARTER", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
    expect(builder(RAVAGE_RED)).toEqual([null, "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
  });

  it("is the Builder's pill for every captured weapon and part on its own", async () => {
    const data = await capturedBuilderData();
    const table = data.prices.prices;
    const items = [
      ...snapshotWeaponList(data.snapshot, table),
      ...snapshotPartCatalog(data.snapshot, table),
    ];
    expect(items.length).toBeGreaterThan(70);
    for (const profile of PROFILES) {
      const gate = profile ?? null;
      for (const one of items) {
        const price = buildPriceUnder(gate, { weapon: one, parts: [] });
        expect([one.id, availabilityPill(gate, { weapon: one, parts: [] }, price)]).toEqual([
          one.id,
          builderPill(one, profile),
        ]);
      }
    }
  });
});
