// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BuilderMode, ItemAvailability, WeaponTree } from "@tarkov/data";
import { tinyTree } from "../../test/tiny-tree.js";
import { BuildPanel, type BuildPanelProps } from "./build-panel.js";
import { useSlotSelection } from "./slot-selection.js";

afterEach(() => cleanup());

const NAMES = { "mod-orphan": "Discontinued muzzle brake", "mod-dtk": "Zenit DTK-1 muzzle brake" };
const TREE = tinyTree(
  "w-m4a1",
  [{ nameId: "mod_muzzle", items: ["mod-orphan", "mod-dtk"] }],
  NAMES,
);

// What `itemAvailability(part, null)` returns for a part nothing sells: the one thing an open
// gate still leaves unavailable.
const NO_SOURCES: ItemAvailability = { available: false, reason: "no-sources" };
const ON_FLEA: ItemAvailability = { available: true, kind: "flea", priceRUB: 4_500 };

/** The panel with a real selection over `attachments`, as the Builder page wires it. */
function Panel(props: Omit<BuildPanelProps, "selection">) {
  const selection = useSlotSelection(props.tree.data, props.attachments);
  return <BuildPanel {...props} selection={selection} />;
}

function renderPanel(
  mode: BuilderMode,
  attachments: Record<string, string> = {},
  flags: { missingRequired?: string[]; conflicts?: string[] } = {},
) {
  render(
    <Panel
      tree={{ data: TREE, isLoading: false, error: null } as UseQueryResult<WeaponTree, Error>}
      attachments={attachments}
      attachedCount={Object.keys(attachments).length}
      getAvailability={(id) => (id === "mod-orphan" ? NO_SOURCES : ON_FLEA)}
      mode={mode}
      orphaned={[]}
      modNames={NAMES}
      onDismissOrphaned={vi.fn()}
      presets={<p>preset select</p>}
      {...flags}
    />,
  );
}

const muzzleRow = () => screen.getByRole("treeitem", { name: /^mod_muzzle/ });

describe("BuildPanel", () => {
  it("shows the slot tree, the first slot selected", () => {
    renderPanel("theorycraft");
    expect(screen.getByRole("tree", { name: "Slots" })).toBeInTheDocument();
    expect(muzzleRow()).toHaveAttribute("aria-selected", "true");
  });

  it("in theorycraft, shows a fitted part nobody sells without a Locked pill", () => {
    renderPanel("theorycraft", { mod_muzzle: "mod-orphan" });
    expect(within(muzzleRow()).getByText("Discontinued muzzle brake")).toBeInTheDocument();
    expect(within(muzzleRow()).queryByText("Locked")).not.toBeInTheDocument();
  });

  it("in progression, marks a fitted part the profile cannot get Locked", () => {
    renderPanel("progression", { mod_muzzle: "mod-orphan" });
    expect(within(muzzleRow()).getByText("Locked")).toBeInTheDocument();
  });

  it("carries the fitted part's source in its row", () => {
    renderPanel("progression", { mod_muzzle: "mod-dtk" });
    expect(within(muzzleRow()).getByText("Flea")).toBeInTheDocument();
  });

  it("carries the preset control in its header", () => {
    renderPanel("theorycraft");
    const panel = screen.getByRole("region", { name: "Build" });
    expect(within(panel).getByText("preset select")).toBeInTheDocument();
    expect(within(panel).getByText("0 attached")).toBeInTheDocument();
  });

  it("flags an incomplete build, naming the empty required slots", () => {
    renderPanel("theorycraft", {}, { missingRequired: ["Barrel", "Gas block"] });
    const pill = screen.getByText("Incomplete · 2 required empty");
    expect(pill).toHaveAttribute("title", "Required slots empty: Barrel, Gas block");
  });

  it("flags clashing parts, listing each pair", () => {
    renderPanel("theorycraft", {}, { conflicts: ["ADAR stock × M4SS"] });
    expect(screen.getByText("Conflict · 1")).toHaveAttribute("title", "ADAR stock × M4SS");
  });

  it("shows neither flag for a complete build with no clash", () => {
    renderPanel("theorycraft");
    expect(screen.queryByText(/Incomplete/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conflict/)).not.toBeInTheDocument();
  });
});
