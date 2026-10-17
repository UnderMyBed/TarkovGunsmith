// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestBuilderData } from "../../../test/test-builder-data.js";
import { createTestClient } from "../../../test/test-client.js";
import { tinyTree } from "../../../test/tiny-tree.js";
import * as TarkovData from "@tarkov/data";
import {
  DEFAULT_PROFILE,
  type BuildV6,
  type BuyForEntry,
  type PlayerProfile,
  type PricedPreset,
} from "@tarkov/data";
import { CompareWorkspace } from "./compare-workspace.js";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  weaponsQuery = idleQuery;
  presetsQuery = idleQuery;
  pricesQuery = idleQuery;
  catalogQuery = idleQuery;
  trees = {};
  savePair.mockReset();
});

// CompareWorkspace and its children (CompareSide) pull weapon/mod/tree query hooks and
// pair mutations from @tarkov/data. None of those are relevant to the sessionStorage
// prefill behaviour under test, so they're stubbed to inert query/mutation shapes; every
// type and pure function (CURRENT_PAIR_VERSION, slotDiff, ...) comes from the real module.
// The re-seed tests below set the weapons, presets and prices; every other test leaves them idle.
const idleQuery = { data: undefined, isLoading: false, error: null };
let weaponsQuery: { data: unknown; isLoading: boolean; error: Error | null } = idleQuery;
let presetsQuery: { data: unknown; isLoading: boolean; error: Error | null } = idleQuery;
let pricesQuery: { data: unknown; isLoading: boolean; error: Error | null } = idleQuery;
let catalogQuery: { data: unknown; isLoading: boolean; error: Error | null } = idleQuery;
// Slot trees by weapon id; a weapon not here has none loaded.
let trees: Record<string, unknown> = {};
const savePair = vi.fn();
vi.mock("@tarkov/data", async () => {
  const actual = await vi.importActual<typeof TarkovData>("@tarkov/data");
  return {
    ...actual,
    useWeaponList: () => weaponsQuery,
    usePartCatalog: () => catalogQuery,
    useWeaponPresets: () => presetsQuery,
    useLivePrices: () => pricesQuery,
    useWeaponTree: (id: string) =>
      trees[id] === undefined ? idleQuery : { data: trees[id], isLoading: false, error: null },
    useTasks: () => idleQuery,
    useSavePair: () => ({ mutate: savePair, isPending: false, error: null }),
    useForkPair: () => ({ mutate: vi.fn(), isPending: false, error: null }),
    useBuilderData: () => mockBuilderData,
  };
});

// The real snapshot the route tests run on, so the paste-url side resolves against real data.
let mockBuilderData: TarkovData.BuilderDataSource;
let realBuilderData: TarkovData.BuilderDataSource;
beforeAll(async () => {
  realBuilderData = await createTestBuilderData(createTestClient());
  mockBuilderData = realBuilderData;
});

const leftBuild: BuildV6 = {
  version: 6,
  weaponId: "w-left",
  attachments: {},
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

describe("CompareWorkspace sessionStorage prefill", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("consumes a left-only prefill on mount and clears the sessionStorage keys", () => {
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
    sessionStorage.setItem("compare:mode", "solo");

    render(<CompareWorkspace />);

    // draft.state.left got the prefilled build: CompareSide's "Build A" section title shows
    // an attachment count ("0 attached", since leftBuild has none) instead of "empty", which
    // is only possible if `draft.setSide("left", leftBuild)` actually ran.
    expect(screen.getByText("0 attached")).toBeInTheDocument();
    // Side B was never targeted by the prefill and stays untouched.
    expect(screen.getByText("empty")).toBeInTheDocument();

    // The one-shot consumer clears its keys after running, whichever branch it took.
    expect(sessionStorage.getItem("compare:leftPrefill")).toBeNull();
    expect(sessionStorage.getItem("compare:mode")).toBeNull();

    // markClean() ran in the `finally` block — a fresh clone from Builder should not start
    // the page in a "you have unsaved changes" state.
    expect(screen.queryByText(/unsaved/i)).not.toBeInTheDocument();
  });

  it("resolves a pasted right-hand build against the game data, orphaning unknown parts", async () => {
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
    sessionStorage.setItem("compare:mode", "paste-url");
    sessionStorage.setItem("compare:rightBuildId", "abcd2345");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...leftBuild,
              weaponId: "w-right",
              attachments: { mod_stock: "gone-part" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );
    try {
      render(<CompareWorkspace />);
      // Side B holds the build with the unknown part moved off the weapon, as the Builder
      // would load it: nothing attached, and the part named in its orphan banner.
      expect(
        await screen.findByText("gone-part — not a part the Builder knows"),
      ).toBeInTheDocument();
      expect(screen.getAllByText("0 attached")).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("when the pasted build cannot be read", () => {
    const paste = (status: number) => {
      sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
      sessionStorage.setItem("compare:mode", "paste-url");
      sessionStorage.setItem("compare:rightBuildId", "abcd2345");
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ ...leftBuild, weaponId: "w-right" }), { status }),
          ),
        ),
      );
    };
    afterEach(() => {
      vi.unstubAllGlobals();
      mockBuilderData = realBuilderData;
    });

    it("says the game data was updated when the snapshot is from another version", async () => {
      mockBuilderData = {
        ...realBuilderData,
        snapshot: () => Promise.reject(new TarkovData.SnapshotVersionError(2)),
      };
      paste(200);
      render(<CompareWorkspace />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Failed to load data: Game data was updated. Reload the page.",
      );
      expect(screen.getByText("empty")).toBeInTheDocument();
    });

    it("leaves side B empty and says nothing when only the build failed to load", async () => {
      paste(404);
      const loaded = vi.spyOn(realBuilderData, "snapshot");
      render(<CompareWorkspace />);
      await vi.waitFor(() => expect(loaded).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("empty")).toBeInTheDocument();
      loaded.mockRestore();
    });
  });

  it("does not touch sessionStorage when a loader-supplied initialPair is present", () => {
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
    sessionStorage.setItem("compare:mode", "solo");

    render(
      <CompareWorkspace
        initialPair={{
          v: 1,
          createdAt: "2026-04-22T00:00:00Z",
          left: null,
          right: null,
        }}
        initialPairId="abc12345"
      />,
    );

    // A route-loaded pair takes precedence — the mount-time snapshot's `initialPair` gate
    // means the prefill branch never runs, so the keys are left untouched for whatever
    // /builder/compare/$pairId visit set them (or didn't).
    expect(sessionStorage.getItem("compare:leftPrefill")).not.toBeNull();
    expect(sessionStorage.getItem("compare:mode")).not.toBeNull();
  });
});

// Before live prices arrive the flea preset counts as buyable at an unknown price and sorts
// ahead of the Prapor one by short name; once they arrive the Prapor preset is the cheaper.
// (The same fixture `useBuilderState.test.tsx` seeds the Builder with.)
const WEAPON = "w-m4a1";
function trader(name: string, minTraderLevel: number, priceRUB: number | null): BuyForEntry {
  return {
    priceRUB,
    currency: "RUB",
    vendor: {
      __typename: "TraderOffer",
      normalizedName: name,
      minTraderLevel,
      taskUnlock: null,
      trader: { normalizedName: name },
    },
  };
}
function flea(priceRUB: number | null): BuyForEntry {
  return {
    priceRUB,
    currency: "RUB",
    vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 0 },
  };
}
function preset(
  id: string,
  isDefault: boolean,
  attachments: Record<string, string>,
  buyFor: BuyForEntry[],
): PricedPreset {
  return { id, name: id, shortName: id, weaponId: WEAPON, isDefault, attachments, buyFor };
}
const DEFAULT_ATTACHMENTS = { mod_muzzle: "mod-muzzle", mod_stock: "mod-stock" };
const FLEA_ATTACHMENTS = { mod_stock: "mod-stock" };
const PRAPOR_ATTACHMENTS = { mod_muzzle: "mod-muzzle" };
const presetsWith = (fleaPrice: number | null, praporPrice: number | null) => ({
  [WEAPON]: [
    preset("default", true, DEFAULT_ATTACHMENTS, [trader("mechanic", 2, 40_000)]),
    preset("flea", false, FLEA_ATTACHMENTS, [flea(fleaPrice)]),
    preset("prapor", false, PRAPOR_ATTACHMENTS, [trader("prapor", 1, praporPrice)]),
  ],
});
const UNPRICED = presetsWith(null, null);
const PRICED = presetsWith(90_000, 50_000);
const PRICES_READY = { data: { asOf: "2026-10-17T00:00:00.000Z" }, isLoading: false, error: null };
const FLEA_PROFILE: PlayerProfile = { ...DEFAULT_PROFILE, flea: true, level: 20 };

describe("CompareWorkspace seeding before live prices arrive", () => {
  beforeEach(() => {
    weaponsQuery = { data: [{ id: WEAPON, name: "M4A1" }], isLoading: false, error: null };
    presetsQuery = { data: UNPRICED, isLoading: false, error: null };
  });

  /** A handoff that leaves side B empty, under `profile` when one is given. */
  function handOff(profile: PlayerProfile | undefined) {
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
    sessionStorage.setItem("compare:mode", "empty-right");
    if (profile) sessionStorage.setItem("compare:profile", JSON.stringify(profile));
  }

  /** Both sides' builds as the next save sends them. */
  async function savedPair(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Save comparison" }));
    return savePair.mock.calls.at(-1)?.[0] as { left: BuildV6 | null; right: BuildV6 | null };
  }
  /** Side B's build as the next save sends it. */
  async function savedRight(user: ReturnType<typeof userEvent.setup>) {
    return (await savedPair(user)).right;
  }
  const pickOnB = (user: ReturnType<typeof userEvent.setup>) =>
    user.selectOptions(screen.getByLabelText("Weapon", { selector: "#compare-weapon-B" }), WEAPON);
  function deliverPrices(rerender: (ui: React.ReactElement) => void) {
    presetsQuery = { data: PRICED, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender(<CompareWorkspace />);
  }

  it("redoes a side's progression seed once prices arrive", async () => {
    const user = userEvent.setup();
    handOff(FLEA_PROFILE);
    const { rerender } = render(<CompareWorkspace />);
    await user.selectOptions(
      screen.getByLabelText("Weapon", { selector: "#compare-weapon-B" }),
      WEAPON,
    );
    // No save before the prices: a save commits the seed (see below).

    presetsQuery = { data: PRICED, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender(<CompareWorkspace />);
    expect((await savedRight(user))?.attachments).toEqual(PRAPOR_ATTACHMENTS);
  });

  it("never redoes a seed the user has edited since", async () => {
    const user = userEvent.setup();
    handOff(FLEA_PROFILE);
    const { rerender } = render(<CompareWorkspace />);
    await user.selectOptions(
      screen.getByLabelText("Weapon", { selector: "#compare-weapon-B" }),
      WEAPON,
    );
    // Swapping the sides is an edit to both.
    await user.click(screen.getByRole("button", { name: "Swap L↔R" }));
    await user.click(screen.getByRole("button", { name: "Swap L↔R" }));

    presetsQuery = { data: PRICED, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender(<CompareWorkspace />);
    expect((await savedRight(user))?.attachments).toEqual(FLEA_ATTACHMENTS);
  });

  it("does not wait for prices on a side with no profile, whose seed reads none", async () => {
    const user = userEvent.setup();
    handOff(undefined);
    const { rerender } = render(<CompareWorkspace />);
    await user.selectOptions(
      screen.getByLabelText("Weapon", { selector: "#compare-weapon-B" }),
      WEAPON,
    );
    expect((await savedRight(user))?.attachments).toEqual(DEFAULT_ATTACHMENTS);

    presetsQuery = { data: PRICED, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender(<CompareWorkspace />);
    expect((await savedRight(user))?.attachments).toEqual(DEFAULT_ATTACHMENTS);
  });

  /** A tree, weapon and parts complete enough for the side's stats and price to work out. */
  function stockM4A1() {
    trees = {
      [WEAPON]: tinyTree(WEAPON, [
        { nameId: "mod_muzzle", items: ["mod-muzzle"] },
        { nameId: "mod_stock", items: ["mod-stock"] },
      ]),
    };
    // The stats read the weapon and parts, so both carry the fields they need. The M4A1's
    // stats, as in useBuilderState.test.tsx; neutral parts (no stat changes).
    weaponsQuery = {
      data: [
        {
          id: WEAPON,
          name: "M4A1",
          types: [],
          weight: 0.75,
          velocity: 0,
          properties: {
            ergonomics: 48,
            recoilVertical: 119,
            recoilHorizontal: 342,
            fireRate: 800,
            centerOfImpact: 0.01,
            deviationCurve: 1.35,
            effectiveDistance: 500,
            sightingRange: 100,
          },
          defaultAmmo: null,
          buyFor: [],
        },
      ],
      isLoading: false,
      error: null,
    };
    // Prapor LL1 sells both parts, so the side's profile can fit them.
    catalogQuery = {
      data: ["mod-muzzle", "mod-stock"].map((id) => ({
        id,
        name: id,
        shortName: id,
        types: ["mods"],
        conflictingItems: [],
        conflictingSlotIds: [],
        weight: 0.1,
        properties: {
          propertiesType: "ItemPropertiesWeaponMod",
          ergonomics: 0,
          recoilModifier: 0,
          accuracyModifier: 0,
          velocity: 0,
        },
        buyFor: [trader("prapor", 1, 1_000)],
      })),
      isLoading: false,
      error: null,
    };
  }

  it("keeps a part attached after the pick when prices arrive", async () => {
    const user = userEvent.setup();
    stockM4A1();
    handOff(FLEA_PROFILE);
    const { container, rerender } = render(<CompareWorkspace />);
    await pickOnB(user);
    const muzzle = container.querySelector<HTMLElement>(
      '[role="treeitem"][data-slot-path="mod_muzzle"]',
    );
    if (muzzle === null) throw new Error("side B's muzzle slot is not rendered");
    await user.click(muzzle);
    await user.click(screen.getByRole("button", { name: /^Fit mod-muzzle/ }));
    // No save before the prices: a save would commit the seed by itself.
    const edited = { ...FLEA_ATTACHMENTS, ...PRAPOR_ATTACHMENTS };

    deliverPrices(rerender);
    expect((await savedRight(user))?.attachments).toEqual(edited);
  });

  it.each([["Clone R→L"], ["Clone L→R"]])(
    "%s leaves twins that stay twins when prices arrive",
    async (clone) => {
      const user = userEvent.setup();
      handOff(FLEA_PROFILE);
      const { rerender } = render(<CompareWorkspace />);
      await pickOnB(user);
      if (clone === "Clone L→R") {
        // Make side A the same pending pick first, then clone it over B.
        await user.selectOptions(
          screen.getByLabelText("Weapon", { selector: "#compare-weapon-A" }),
          WEAPON,
        );
      }
      await user.click(screen.getByRole("button", { name: clone }));

      deliverPrices(rerender);
      const pair = await savedPair(user);
      expect(pair.left?.attachments).toEqual(FLEA_ATTACHMENTS);
      expect(pair.right?.attachments).toEqual(FLEA_ATTACHMENTS);
    },
  );

  it("offers sorting a side's parts by price only once prices are in", async () => {
    const user = userEvent.setup();
    stockM4A1();
    handOff(FLEA_PROFILE);
    const { rerender } = render(<CompareWorkspace />);
    await pickOnB(user);
    const priceOption = () =>
      within(screen.getByRole("combobox", { name: "Sort by" })).queryByRole("option", {
        name: "Price",
      });
    expect(priceOption()).not.toBeInTheDocument();

    deliverPrices(rerender);
    expect(priceOption()).toBeInTheDocument();
  });

  it("treats a save as committing both sides: a seed is not redone after it", async () => {
    const user = userEvent.setup();
    handOff(FLEA_PROFILE);
    const { rerender } = render(<CompareWorkspace />);
    await pickOnB(user);
    expect((await savedRight(user))?.attachments).toEqual(FLEA_ATTACHMENTS);

    deliverPrices(rerender);
    expect((await savedRight(user))?.attachments).toEqual(FLEA_ATTACHMENTS);
  });
});
