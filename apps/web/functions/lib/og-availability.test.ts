import { describe, expect, it } from "vitest";
import {
  buildPriceUnder,
  DEFAULT_PROFILE,
  itemAvailability,
  priceGate,
  snapshotPartCatalog,
  snapshotWeaponList,
  snapshotWeaponPresets,
  type AvailabilityInput,
  type BuyForEntry,
  type AttachablePart,
  type BuildPriceInput,
  type PlayerProfile,
  type PriceGate,
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

function barter(trader: string, minTraderLevel: number, priceRUB: number | null, quest?: string) {
  return {
    priceRUB,
    currency: null,
    vendor: {
      __typename: "TraderBarter",
      normalizedName: trader,
      minTraderLevel,
      taskUnlock: quest === undefined ? null : { id: null, normalizedName: quest },
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
  const input = {
    weapon: { ...weapon, id: "weapon" },
    parts: parts.map((p, i) => ({ ...p, id: `part-${i}` })),
  };
  return availabilityPill(gate, input, buildPriceUnder(gate, input));
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

  it("says barter only when a barter is at the highest level", () => {
    const gun = item(cash("mechanic", 3, 30_000));
    expect(pill(null, gun, item(barter("prapor", 2, 6_000)))).toBe("LL3");
    expect(pill(null, gun, item(barter("prapor", 3, 6_000)))).toBe("LL3 barter");
  });

  it("says barter, Flea and quest when a path is one, in the Builder's words", () => {
    const gun = item(cash("mechanic", 2, 30_000));
    expect(pill(null, gun, item(barter("prapor", 3, 6_000)))).toBe("LL3 barter");
    expect(pill(null, gun, item(flea(9_000)))).toBe("LL2 · Flea");
    expect(pill(LL4, gun, item(cash("peacekeeper", 3, 5_000, "gunsmith-part-4")))).toBe(
      "LL3 · quest",
    );
    expect(pill(null, item(flea(31_000)))).toBe("Flea");
  });

  it("reads a quest-gated barter as the Builder labels it", () => {
    const stock = item(barter("prapor", 3, 21_000, "shootout-picnic"));
    // The Builder's label for the same offer under the same profile.
    const builder = itemAvailability(stock, LL4);
    expect(availabilityLabel(builder)).toBe("LL3 barter · quest");
    expect(pill(LL4, stock)).toBe(availabilityLabel(builder));
  });

  it("reads Locked when the profile cannot buy the build", () => {
    const gun = item(cash("mechanic", 2, 30_000));
    expect(pill(DEFAULT_PROFILE, gun)).toBe("Locked");
    // A part with no offer at all, or only on a flea the profile has no access to.
    expect(pill(LL4, gun, item())).toBe("Locked");
    expect(pill(LL4, gun, item(flea(9_000)))).toBe("Locked");
    // Ref is a trader no profile tracks: Ref-only reads as locked under one.
    expect(pill(LL4, gun, item(barter("ref", 3, null)))).toBe("Locked");
  });

  it("in theorycraft, shows a part nobody sells as nothing, not as gated", () => {
    const gun = item(cash("mechanic", 2, 30_000));
    expect(pill(null, gun, item())).toBe("LL2");
    expect(pill(null, gun, item({ ...flea(null), unlisted: true }))).toBe("LL2");
    // Ref is open in theorycraft, by its own level.
    expect(pill(null, gun, item(barter("ref", 3, null)))).toBe("LL3 barter");
    // Nothing to show at all: no pill, never an invented one.
    expect(pill(null, item(), item())).toBeNull();
  });

  it("names the path the price chose: a preset's parts are not steps", () => {
    const presetOffer = { id: "preset", normalizedName: "preset" };
    const gun = { ...item({ ...cash("mechanic", 2, 40_000), preset: presetOffer }), id: "weapon" };
    // Nobody sells the stock on its own, and the scope needs LL4; the preset comes with both.
    const unsold = { ...item(), id: "stock" };
    const scope = { ...item(cash("jaeger", 4, 90_000)), id: "scope" };
    const input = {
      weapon: gun,
      parts: [unsold, scope],
      presets: [{ id: "preset", attachments: { mod_stock: "stock", mod_scope: "scope" } }],
    };
    const price = buildPriceUnder(LL4, input);
    expect(price).toMatchObject({ status: "priced", totalRUB: 40_000, presetId: "preset" });
    expect(availabilityPill(LL4, input, price)).toBe("LL2");
  });

  it("names a preset's own flea listing", () => {
    // No offer on the receiver; the preset item is listed on the flea in its own right.
    const fleaOnly = {
      weapon: { ...item(), id: "weapon" },
      parts: [],
      presets: [{ id: "preset", attachments: {}, buyFor: [flea(50_000)] }],
    };
    for (const gate of [null, { ...DEFAULT_PROFILE, flea: true, level: 20 }]) {
      const price = buildPriceUnder(gate, fleaOnly);
      expect(price).toMatchObject({ status: "priced", totalRUB: 50_000 });
      expect(availabilityPill(gate, fleaOnly, price)).toBe("Flea");
    }
  });
});

// ---------- Parity with the Builder over the captured game data ----------

/** What the Builder's pill says for one item: `useBuilderState`'s gate, `BuildPanel`'s filter. */
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
  const cases: { name: string; attachments: Readonly<Record<string, string>> }[] = [
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
    "bare M4A1": ["LL3", "Locked", "LL3", "LL3", "LL3"],
    "with a buffer tube": ["LL3", "Locked", "LL3", "LL3", "LL3"],
    // Theorycraft and the flea profile buy the stock on the flea, where it is cheaper; LL4
    // without flea gets it from Peacekeeper, assuming the quest; advanced mode lacks it.
    "with a quest-gated stock": ["LL3 · Flea", "Locked", "LL3 · quest", "Locked", "LL3 · Flea"],
    // Ref is open in theorycraft only: no profile tracks a level for him.
    "with a barter-only stock": ["LL3 barter", "Locked", "Locked", "Locked", "Locked"],
    // Theorycraft does not show a part nobody sells as gated.
    "with a stock nobody sells": ["LL3", "Locked", "Locked", "Locked", "Locked"],
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
    expect(builder(BUFFER_TUBE)).toEqual(["LL2", "Locked", "LL2", "LL2", "LL2"]);
    expect(builder(PRS_GEN3)).toEqual(["Flea", "Locked", "LL3 · quest", "Locked", "Flea"]);
    expect(builder(RAVAGE)).toEqual(["LL3 barter", "Locked", "Locked", "Locked", "Locked"]);
    expect(builder(RAVAGE_RED)).toEqual([null, "Locked", "Locked", "Locked", "Locked"]);
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
        const input = { weapon: one, parts: [] };
        expect([one.id, availabilityPill(gate, input, buildPriceUnder(gate, input))]).toEqual([
          one.id,
          builderPill(one, profile),
        ]);
      }
    }
  });

  const SOPMOD = "5a8ae73886f7747b2e6e1416";
  const traders = (n: number) => ({
    prapor: n,
    therapist: n,
    skier: n,
    peacekeeper: n,
    mechanic: n,
    ragman: n,
    jaeger: n,
  });

  it("reads one purchase the same under every profile that makes it", async () => {
    const data = await capturedBuilderData();
    const table = data.prices.prices;
    const attachments = snapshotWeaponPresets(data.snapshot, table)[M4A1]!.find(
      (p) => p.id === SOPMOD,
    )!.attachments;
    const profiles: PlayerProfile[] = [
      { ...DEFAULT_PROFILE, traders: traders(2) },
      { ...DEFAULT_PROFILE, traders: traders(3) },
      LL4,
      ADVANCED_LL4,
      { ...LL4, flea: true, level: 30 },
    ];
    const cards = profiles.map((gate) =>
      fetchOgRowsForBuild({ weaponId: M4A1, attachments, gate }, data),
    );
    // Each buys the SOPMOD II preset by its Peacekeeper LL2 barter, for the same ₽142,000...
    expect(cards.map((c) => c.priceRub)).toEqual(Array(5).fill(142_000));
    // ...so each reads the same, though the preset comes with parts that, bought on their own,
    // need LL4 and the flea.
    expect(cards.map((c) => c.availability)).toEqual(Array(5).fill("LL2 barter"));
    const parts = new Map(snapshotPartCatalog(data.snapshot, table).map((p) => [p.id, p]));
    const ownPills = new Set(
      Object.values(attachments).map((id) => builderPill(parts.get(id)!, LL4)),
    );
    expect(ownPills.has("LL4")).toBe(true);
  });

  it("matches the price's own path, label by label, for captured and mixed builds", async () => {
    const data = await capturedBuilderData();
    const table = data.prices.prices;
    const catalog = snapshotPartCatalog(data.snapshot, table);
    const partsById = new Map(catalog.map((p) => [p.id, p]));
    const presetsBy = snapshotWeaponPresets(data.snapshot, table);
    const gates: PriceGate[] = [
      null,
      DEFAULT_PROFILE,
      { ...DEFAULT_PROFILE, traders: traders(2) },
      { ...DEFAULT_PROFILE, traders: traders(3) },
      LL4,
      ADVANCED_LL4,
      { ...LL4, flea: true, level: 10 },
      { ...LL4, flea: true, level: 30 },
      { ...DEFAULT_PROFILE, flea: true, level: 40 },
    ];

    /**
     * The expected pill, worked out without the code under test or `weaponPaths`: the weapon's
     * offers on the chosen path rebuilt from its raw `buyFor` (those for the chosen preset, or
     * its own for the receiver, plus the preset item's own listing), each preset part counted
     * off by hand, and the Builder's labels for every step summed by reading their text.
     */
    function expectedPill(gate: PriceGate, input: BuildPriceInput): string | null {
      let parts = input.parts;
      let price = buildPriceUnder(gate, input);
      if (price.status === "unobtainable") {
        if (gate !== null) return "Locked";
        // Theorycraft: the parts nobody sells show as nothing; choose without them.
        parts = parts.filter((p) => itemAvailability(p, null).available);
        price = buildPriceUnder(null, { ...input, parts });
        rechosen++;
      }
      const labels: string[] = [];
      const left = new Map<string, number>();
      if (price.status !== "unobtainable") {
        const id = price.presetId;
        const preset = input.presets?.find((p) => p.id === id);
        const offers = (input.weapon.buyFor ?? [])
          .filter((e) => (id === null ? e.preset === undefined : e.preset?.id === id))
          .concat(preset?.buyFor ?? []);
        labels.push(
          availabilityLabel(itemAvailability({ buyFor: offers, types: input.weapon.types }, gate)),
        );
        for (const part of Object.values(preset?.attachments ?? {})) {
          left.set(part, (left.get(part) ?? 0) + 1);
        }
      }
      for (const part of parts) {
        const n = left.get(part.id) ?? 0;
        if (n > 0) left.set(part.id, n - 1);
        else labels.push(availabilityLabel(itemAvailability(part, gate)));
      }
      expect(labels).not.toContain("Locked");
      const levels = labels.flatMap((l) => /^LL(\d+)/.exec(l)?.[1] ?? []).map(Number);
      const max = levels.length === 0 ? null : Math.max(...levels);
      const out: string[] = [];
      if (max !== null) {
        out.push(
          labels.some((l) => l.startsWith(`LL${max} barter`)) ? `LL${max} barter` : `LL${max}`,
        );
      }
      if (labels.includes("Flea")) out.push("Flea");
      if (labels.some((l) => l.endsWith(" · quest"))) out.push("quest");
      return out.length === 0 ? null : out.join(" · ");
    }

    // A fixed-seed generator, so every run draws the same builds.
    let seed = 12_345;
    const rand = (n: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    const pick = () => catalog[rand(catalog.length)]!;

    let rechosen = 0;
    let compared = 0;
    for (const weapon of snapshotWeaponList(data.snapshot, table)) {
      const presets = presetsBy[weapon.id] ?? [];
      const builds: AttachablePart[][] = [[]];
      for (const preset of presets) {
        const own = Object.values(preset.attachments).map((id) => partsById.get(id)!);
        builds.push(own);
        for (let k = 0; k < 4; k++) {
          // Half the preset's parts, three more from the catalog, a covered part twice and an
          // extra part twice.
          const half = own.filter(() => rand(2) === 0);
          const extra = [pick(), pick(), pick()];
          builds.push([...half, ...extra, ...half.slice(0, 1), extra[0]!]);
        }
      }
      for (let k = 0; k < 4; k++) builds.push([pick(), pick(), pick(), pick()]);
      for (const parts of builds) {
        const input = { weapon, parts, presets };
        for (const gate of gates) {
          const got = availabilityPill(gate, input, buildPriceUnder(gate, input));
          const ids = parts.map((p) => p.id);
          expect([weapon.shortName, ids, gate, got]).toEqual([
            weapon.shortName,
            ids,
            gate,
            expectedPill(gate, input),
          ]);
          compared++;
        }
      }
    }
    expect(compared).toBe(315);
    // The theorycraft re-choice ran.
    expect(rechosen).toBeGreaterThan(0);
  });
});
