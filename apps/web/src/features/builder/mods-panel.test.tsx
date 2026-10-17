// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BuilderMode, ItemAvailability, WeaponTree } from "@tarkov/data";
import { tinyTree } from "../../test/tiny-tree.js";
import { ModsPanel } from "./mods-panel.js";

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

function renderPanel(mode: BuilderMode, conflictWith: string | null = null) {
  render(
    <ModsPanel
      tree={{ data: TREE, isLoading: false, error: null } as UseQueryResult<WeaponTree, Error>}
      attachments={{}}
      attachedCount={0}
      onAttach={vi.fn()}
      getAvailability={(id) => (id === "mod-orphan" ? NO_SOURCES : ON_FLEA)}
      mode={mode}
      getConflict={(_, id) => (id === conflictWith ? "Conflicts with Stock" : null)}
      orphaned={[]}
      modNames={NAMES}
      onDismissOrphaned={vi.fn()}
    />,
  );
}

const option = (name: RegExp) => screen.getByRole("button", { name });

describe("ModsPanel", () => {
  it("in theorycraft, shows a part nobody sells neither dimmed nor Locked", () => {
    renderPanel("theorycraft");
    const orphan = option(/Discontinued muzzle brake/);
    expect(within(orphan).queryByText("Locked")).not.toBeInTheDocument();
    expect(within(orphan).queryByText("No sources")).not.toBeInTheDocument();
    // Dimming has no accessible signal; its class is the only observable.
    expect(orphan).not.toHaveClass("opacity-40");
    // An available part keeps its source pill.
    expect(within(option(/Zenit DTK-1/)).getByText("Flea")).toBeInTheDocument();
    expect(screen.queryByLabelText("Show all items")).not.toBeInTheDocument();
  });

  it("in theorycraft, still dims a part that clashes with the build", () => {
    renderPanel("theorycraft", "mod-dtk");
    expect(option(/Zenit DTK-1/)).toHaveClass("opacity-40");
  });

  it("in progression, dims it and marks it Locked with why, unless Show all items is on", () => {
    renderPanel("progression");
    const orphan = option(/Discontinued muzzle brake/);
    expect(within(orphan).getByText("Locked")).toBeInTheDocument();
    expect(within(orphan).getByText("No sources")).toBeInTheDocument();
    expect(orphan).toHaveClass("opacity-40");

    fireEvent.click(screen.getByLabelText("Show all items"));
    expect(option(/Discontinued muzzle brake/)).not.toHaveClass("opacity-40");
  });
});
