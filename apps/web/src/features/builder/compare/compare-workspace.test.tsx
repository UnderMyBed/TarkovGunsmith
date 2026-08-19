// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type * as TarkovData from "@tarkov/data";
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
    useModList: () => idleQuery,
    useWeaponTree: () => idleQuery,
    useSavePair: () => ({ mutate: vi.fn(), isPending: false }),
    useForkPair: () => ({ mutate: vi.fn(), isPending: false }),
  };
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
