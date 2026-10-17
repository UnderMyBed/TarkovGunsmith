// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestBuilderData } from "../../../test/test-builder-data.js";
import { createTestClient } from "../../../test/test-client.js";
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
const savePair = vi.fn();
vi.mock("@tarkov/data", async () => {
  const actual = await vi.importActual<typeof TarkovData>("@tarkov/data");
  return {
    ...actual,
    useWeaponList: () => weaponsQuery,
    usePartCatalog: () => idleQuery,
    useWeaponPresets: () => presetsQuery,
    useLivePrices: () => pricesQuery,
    useWeaponTree: () => idleQuery,
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

  /** Side B's build as the next save would send it. */
  async function savedRight(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Save comparison" }));
    const pair = savePair.mock.calls.at(-1)?.[0] as { right: BuildV6 | null };
    return pair.right;
  }

  it("redoes a side's progression seed once prices arrive", async () => {
    const user = userEvent.setup();
    handOff(FLEA_PROFILE);
    const { rerender } = render(<CompareWorkspace />);
    await user.selectOptions(
      screen.getByLabelText("Weapon", { selector: "#compare-weapon-B" }),
      WEAPON,
    );
    expect((await savedRight(user))?.attachments).toEqual(FLEA_ATTACHMENTS);

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
});
