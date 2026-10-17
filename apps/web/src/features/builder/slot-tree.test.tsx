// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ItemAvailability, SlotDiffMap, WeaponTree } from "@tarkov/data";
import { tinyTree, type SlotSpec } from "../../test/tiny-tree.js";
import { SlotInspector } from "./slot-inspector.js";
import { useSlotSelection } from "./slot-selection.js";
import { SlotTree, type SlotDiffSide, type SlotTreeDiffProps } from "./slot-tree.js";

afterEach(() => cleanup());

/* What a user sees and does in the tree: slot names, the fitted-vs-empty readout, which slot is
 * selected, and the keys that move between rows and into the inspector. Nothing here asserts a
 * class name or an inline style. The parts themselves are the inspector's: slot-inspector.test. */

const NAMES = {
  "mod-dtk": "Zenit DTK-1 muzzle brake",
  "mod-adapter": "SureFire muzzle adapter",
  "mod-can": "Nightforce suppressor",
  "mod-stock": "Magpul CTR carbine stock",
};

/** A muzzle adapter that itself has a sub-slot, so nesting has something real to reveal. */
const MUZZLE: SlotSpec = {
  nameId: "mod_muzzle",
  name: "Muzzle",
  items: [
    "mod-dtk",
    ["mod-adapter", [{ nameId: "mod_muzzle", name: "Suppressor mount", items: ["mod-can"] }]],
  ],
};
const STOCK: SlotSpec = {
  nameId: "mod_stock",
  name: "Stock",
  required: true,
  items: ["mod-stock"],
};

function tree(slots: readonly SlotSpec[]): WeaponTree {
  return { ...tinyTree("w-m4a1", slots, NAMES), weaponName: "Colt M4A1" };
}

const DEFAULT_TREE = tree([MUZZLE, STOCK]);

interface HarnessProps {
  tree?: WeaponTree;
  attachments?: Record<string, string>;
  onAttach?: (path: string, itemId: string | null) => void;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  getFittedConflict?: (path: string) => string | null;
  /** Compare's diff and the side this tree shows; they travel together. */
  compare?: { diff: SlotDiffMap; side: SlotDiffSide };
}

/** The tree and the inspector wired through one selection, as the Builder wires them. */
function Workbench({
  tree: t = DEFAULT_TREE,
  attachments = {},
  onAttach = vi.fn(),
  getAvailability,
  getFittedConflict,
  compare,
}: HarnessProps) {
  const selection = useSlotSelection(t, attachments);
  const slot = selection.selected?.slot;
  const diffProps: SlotTreeDiffProps = compare ?? {};
  return (
    <>
      <SlotTree
        selection={selection}
        attachments={attachments}
        getAvailability={getAvailability}
        getFittedConflict={getFittedConflict}
        {...diffProps}
      />
      {slot && (
        <SlotInspector
          weaponId={t.weaponId}
          id={selection.inspectorId}
          slot={slot}
          fittedId={attachments[slot.path] ?? null}
          parts={new Map()}
          onAttach={onAttach}
          getAvailability={getAvailability ?? (() => null)}
          mode="theorycraft"
          pricesReady={false}
          onEscape={selection.focusTreeRow}
        />
      )}
    </>
  );
}

function row(label: string): HTMLElement {
  return screen.getByRole("treeitem", { name: new RegExp(`^${label}\\b`) });
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("treeitem");
}

describe("SlotTree — rows", () => {
  it("says the weapon has no mod slots rather than rendering an empty shell", () => {
    render(<Workbench tree={tree([])} />);
    expect(screen.getByText("This weapon has no mod slots.")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });

  it("lists every top-level slot as a tree row at level 1", () => {
    render(<Workbench />);
    expect(screen.getByRole("tree", { name: "Slots" })).toBeInTheDocument();
    expect(rows().map((r) => r.dataset.slotPath)).toEqual(["mod_muzzle", "mod_stock"]);
    expect(row("Muzzle")).toHaveAttribute("aria-level", "1");
    expect(row("Muzzle")).toHaveAttribute("aria-posinset", "1");
    expect(row("Muzzle")).toHaveAttribute("aria-setsize", "2");
  });

  it("reads as empty until something is fitted, then names the fitted part", () => {
    const { rerender } = render(<Workbench />);
    expect(within(row("Muzzle")).getByText("empty")).toBeInTheDocument();
    rerender(<Workbench attachments={{ mod_muzzle: "mod-dtk" }} />);
    expect(within(row("Muzzle")).queryByText("empty")).not.toBeInTheDocument();
    expect(within(row("Muzzle")).getByText("Zenit DTK-1 muzzle brake")).toBeInTheDocument();
  });

  it("marks a required slot, and flags it while it is empty", () => {
    const { rerender } = render(<Workbench />);
    expect(row("Stock")).toHaveAccessibleName(/required/);
    expect(within(row("Stock")).getByText("Required")).toBeInTheDocument();
    expect(within(row("Muzzle")).queryByText("Required")).not.toBeInTheDocument();
    rerender(<Workbench attachments={{ mod_stock: "mod-stock" }} />);
    expect(within(row("Stock")).queryByText("Required")).not.toBeInTheDocument();
  });

  it("carries the fitted part's availability pill and any clash it has", () => {
    render(
      <Workbench
        attachments={{ mod_muzzle: "mod-dtk" }}
        getAvailability={(id) =>
          id === "mod-dtk"
            ? {
                available: true,
                kind: "trader",
                traderNormalizedName: "prapor",
                minLevel: 1,
                priceRUB: 3000,
                preset: null,
                assumedQuest: null,
              }
            : null
        }
        getFittedConflict={(path) => (path === "mod_muzzle" ? "Conflicts with CTR" : null)}
      />,
    );
    expect(within(row("Muzzle")).getByText("LL1")).toBeInTheDocument();
    expect(within(row("Muzzle")).getByText("Conflicts with CTR")).toBeInTheDocument();
  });
});

describe("SlotTree — nested slots", () => {
  it("shows a fitted part's own slots as the rows under it, one level deeper", () => {
    render(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    const child = row("Suppressor mount");
    expect(child).toHaveAttribute("data-slot-path", "mod_muzzle/mod_muzzle");
    expect(child).toHaveAttribute("aria-level", "2");
    expect(row("Muzzle")).toHaveAttribute("aria-expanded", "true");
    expect(rows().map((r) => r.dataset.slotPath)).toEqual([
      "mod_muzzle",
      "mod_muzzle/mod_muzzle",
      "mod_stock",
    ]);
  });

  it("hides the slots of a part that is not fitted", () => {
    render(<Workbench attachments={{ mod_muzzle: "mod-dtk" }} />);
    expect(screen.queryByText("Suppressor mount")).not.toBeInTheDocument();
    expect(row("Muzzle")).not.toHaveAttribute("aria-expanded");
  });

  it("shows a slot as deep as the fitted parts go, with no level cap", () => {
    const chain = (depth: number): SlotSpec => ({
      nameId: `mod_l${depth}`,
      name: `Level ${depth}`,
      items: depth === 5 ? [`part-${depth}`] : [[`part-${depth}`, [chain(depth + 1)]]],
    });
    const attachments: Record<string, string> = {};
    let path = "";
    for (let d = 1; d <= 4; d++) {
      path = path ? `${path}/mod_l${d}` : `mod_l${d}`;
      attachments[path] = `part-${d}`;
    }
    render(<Workbench tree={tree([chain(1)])} attachments={attachments} />);
    expect(row("Level 5")).toHaveAttribute("aria-level", "5");
  });
});

describe("SlotTree — selection", () => {
  it("selects the first slot by default and shows it in the inspector", () => {
    render(<Workbench />);
    expect(row("Muzzle")).toHaveAttribute("aria-selected", "true");
    expect(row("Stock")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("region", { name: "Muzzle options" })).toBeInTheDocument();
  });

  it("selects a slot when its row is clicked", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(row("Stock"));
    expect(row("Stock")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Stock options" })).toBeInTheDocument();
  });

  it("keeps the selection when a part is fitted, and its children appear", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const { rerender } = render(<Workbench onAttach={onAttach} />);
    await user.click(screen.getByRole("button", { name: "Fit SureFire muzzle adapter" }));
    expect(onAttach).toHaveBeenCalledWith("mod_muzzle", "mod-adapter");
    rerender(<Workbench onAttach={onAttach} attachments={{ mod_muzzle: "mod-adapter" }} />);
    expect(row("Muzzle")).toHaveAttribute("aria-selected", "true");
    expect(row("Suppressor mount")).toBeInTheDocument();
  });

  it("falls back to the nearest slot still on the tree when the selected one goes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    await user.click(row("Suppressor mount"));
    expect(row("Suppressor mount")).toHaveAttribute("aria-selected", "true");
    rerender(<Workbench attachments={{ mod_muzzle: "mod-dtk" }} />);
    expect(row("Muzzle")).toHaveAttribute("aria-selected", "true");
  });

  it("after a fallback, stays on the slot shown when a part brings the old path back", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    await user.click(row("Suppressor mount"));
    // Something outside the inspector swaps the adapter out, so the selection falls back.
    rerender(<Workbench attachments={{ mod_muzzle: "mod-dtk" }} />);
    expect(row("Muzzle")).toHaveAttribute("aria-selected", "true");
    // The adapter comes back: its mount slot reappears, but the selection stays put.
    rerender(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    expect(row("Muzzle")).toHaveAttribute("aria-selected", "true");
    expect(row("Suppressor mount")).toHaveAttribute("aria-selected", "false");
  });

  it("stays readable and selectable when Compare supplies a slot diff", async () => {
    const user = userEvent.setup();
    render(
      <Workbench
        attachments={{ mod_muzzle: "mod-dtk" }}
        compare={{ diff: new Map([["mod_muzzle", "differs"]]), side: "left" }}
      />,
    );
    expect(row("Muzzle")).toHaveAttribute("data-diff", "differs");
    expect(row("Muzzle")).toHaveAccessibleName(/differs from the other build/);
    await user.click(row("Stock"));
    expect(row("Stock")).toHaveAttribute("aria-selected", "true");
  });

  // `slotDiff`: left-only is a part in build A and none in build B, right-only the reverse.
  // Both sides get the same map, so the note depends on which side the tree shows.
  it.each([
    { status: "left-only", filled: "left", empty: "right" },
    { status: "right-only", filled: "right", empty: "left" },
  ] as const)(
    "names a $status slot as filled only on the $filled side, filled elsewhere on the $empty",
    ({ status, filled, empty }) => {
      const diff: SlotDiffMap = new Map([["mod_muzzle", status]]);
      const { unmount } = render(
        <Workbench attachments={{ mod_muzzle: "mod-dtk" }} compare={{ diff, side: filled }} />,
      );
      expect(row("Muzzle")).toHaveAttribute("data-diff", status);
      expect(row("Muzzle")).toHaveAccessibleName(
        "Muzzle: Zenit DTK-1 muzzle brake, filled only in this build",
      );
      unmount();

      render(<Workbench attachments={{}} compare={{ diff, side: empty }} />);
      expect(row("Muzzle")).toHaveAttribute("data-diff", status);
      expect(row("Muzzle")).toHaveAccessibleName("Muzzle: empty, filled in the other build");
    },
  );
});

describe("SlotTree — keyboard", () => {
  it("keeps exactly one row in the tab order, the selected one", () => {
    render(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    const tabbable = rows().filter((r) => r.tabIndex === 0);
    expect(tabbable).toEqual([row("Muzzle")]);
  });

  it("walks the rows with Down, Up, Home and End, stopping at the ends", async () => {
    const user = userEvent.setup();
    render(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    const [muzzle, mount, stock] = rows();
    muzzle!.focus();
    await user.keyboard("{ArrowDown}");
    expect(mount).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(stock).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(stock).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(mount).toHaveFocus();
    await user.keyboard("{Home}");
    expect(muzzle).toHaveFocus();
    await user.keyboard("{End}");
    expect(stock).toHaveFocus();
    // The tab stop follows the focus; the selection does not.
    expect(stock!.tabIndex).toBe(0);
    expect(muzzle).toHaveAttribute("aria-selected", "true");
  });

  it("moves Right into a fitted part's slots and Left back to their parent", async () => {
    const user = userEvent.setup();
    render(<Workbench attachments={{ mod_muzzle: "mod-adapter" }} />);
    row("Muzzle").focus();
    await user.keyboard("{ArrowRight}");
    expect(row("Suppressor mount")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(row("Muzzle")).toHaveFocus();
    // A row with no slots under it stays put.
    row("Stock").focus();
    await user.keyboard("{ArrowRight}");
    expect(row("Stock")).toHaveFocus();
  });

  it("selects with Enter or Space and moves focus into the inspector; Escape comes back", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    row("Muzzle").focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(row("Stock")).toHaveAttribute("aria-selected", "true");
    const stockSearch = within(screen.getByRole("region", { name: "Stock options" })).getByRole(
      "searchbox",
    );
    expect(stockSearch).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(row("Stock")).toHaveFocus();

    await user.keyboard("{ArrowUp}[Space]");
    expect(row("Muzzle")).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("region", { name: "Muzzle options" })).getByRole("searchbox"),
    ).toHaveFocus();
  });
});
