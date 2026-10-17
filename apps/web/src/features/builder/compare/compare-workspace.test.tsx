// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createTestBuilderData } from "../../../test/test-builder-data.js";
import { createTestClient } from "../../../test/test-client.js";
import * as TarkovData from "@tarkov/data";
import type { BuildV6 } from "@tarkov/data";
import { CompareWorkspace } from "./compare-workspace.js";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

// CompareWorkspace and its children (CompareSide) pull weapon/mod/tree query hooks and
// pair mutations from @tarkov/data. None of those are relevant to the sessionStorage
// prefill behaviour under test, so they're stubbed to inert query/mutation shapes; every
// type and pure function (CURRENT_PAIR_VERSION, slotDiff, ...) comes from the real module.
vi.mock("@tarkov/data", async () => {
  const actual = await vi.importActual<typeof TarkovData>("@tarkov/data");
  const idleQuery = { data: undefined, isLoading: false, error: null };
  return {
    ...actual,
    useWeaponList: () => idleQuery,
    usePartCatalog: () => idleQuery,
    useWeaponPresets: () => idleQuery,
    useLivePrices: () => idleQuery,
    useWeaponTree: () => idleQuery,
    useTasks: () => idleQuery,
    useSavePair: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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
