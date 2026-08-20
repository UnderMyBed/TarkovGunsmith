// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AllowedItem,
  ItemAvailability,
  SlotCategory,
  SlotNode,
  WeaponTree,
} from "@tarkov/data";
import { SlotTree } from "./slot-tree.js";

afterEach(() => cleanup());

/* These tests exist to survive the Builder redesign, so they assert only on what a user can
 * see and do: slot names, the attached-vs-empty readout, the option buttons, the requirement
 * that blocks a mod, and the `onAttach` calls the component reports upward. Nothing here
 * asserts a class name, an inline style, or a prop path — a restyle that keeps the behaviour
 * should keep this file green. */

// ---------- Fixture builders ----------

function item(id: string, name: string, children: readonly SlotNode[] = []): AllowedItem {
  return { id, name, children };
}

function slot(
  path: string,
  name: string,
  allowedItems: readonly AllowedItem[],
  extra?: { required?: boolean; allowedCategories?: readonly SlotCategory[] },
): SlotNode {
  return {
    nameId: path.split("/").at(-1) ?? path,
    path,
    name,
    required: extra?.required ?? false,
    allowedItems,
    allowedItemIds: new Set(allowedItems.map((i) => i.id)),
    allowedCategories: extra?.allowedCategories ?? [],
    children: [],
  };
}

/** A muzzle device that itself has a sub-slot, so nesting has something real to reveal. */
const suppressorSubSlot = slot("mod_muzzle/mod_muzzle", "Suppressor mount", [
  item("mod-can", "Nightforce suppressor"),
]);

const dtk = item("mod-dtk", "Zenit DTK-1 muzzle brake");
const adapter = item("mod-adapter", "SureFire muzzle adapter", [suppressorSubSlot]);
const stock = item("mod-stock", "Magpul CTR carbine stock");

const MUZZLE = slot("mod_muzzle", "Muzzle", [dtk, adapter]);
const STOCK = slot("mod_stock", "Stock", [stock], { required: true });

function tree(slots: readonly SlotNode[]): WeaponTree {
  return { weaponId: "w-m4a1", weaponName: "Colt M4A1", slots };
}

const DEFAULT_TREE = tree([MUZZLE, STOCK]);

// ---------- Rendering helpers ----------

/**
 * The disclosure region for one named slot. Scoping through the slot's own name (rather than
 * a test id or a class) keeps assertions readable while `within()` stops a name that appears
 * in two slots from matching the wrong one.
 */
function slotRegion(name: string): HTMLElement {
  const label = screen.getAllByText(name).find((el) => el.closest("details") !== null);
  const region = label?.closest("details");
  if (!region) throw new Error(`no slot region found for "${name}"`);
  return region;
}

/** Expand a slot the way a user does — by activating its header. */
async function openSlot(user: ReturnType<typeof userEvent.setup>, name: string) {
  const region = slotRegion(name);
  const summary = region.querySelector("summary");
  if (!summary) throw new Error(`slot "${name}" has no header to activate`);
  await user.click(summary);
  return region;
}

function renderTree(props?: Partial<React.ComponentProps<typeof SlotTree>>) {
  const onAttach = vi.fn();
  const utils = render(
    <SlotTree tree={DEFAULT_TREE} attachments={{}} onAttach={onAttach} {...props} />,
  );
  return { onAttach, ...utils };
}

// ---------- Availability fixtures ----------

const AVAILABLE_TRADER: ItemAvailability = {
  available: true,
  kind: "trader",
  traderNormalizedName: "prapor",
  minLevel: 1,
  priceRUB: 3000,
};
const AVAILABLE_FLEA: ItemAvailability = { available: true, kind: "flea", priceRUB: 4500 };

describe("SlotTree — empty weapon", () => {
  it("says the weapon has no mod slots rather than rendering an empty shell", () => {
    render(<SlotTree tree={tree([])} attachments={{}} onAttach={vi.fn()} />);
    expect(screen.getByText("This weapon has no mod slots.")).toBeInTheDocument();
  });
});

describe("SlotTree — slot headers", () => {
  it("lists every top-level slot by name", () => {
    renderTree();
    expect(screen.getByText("Muzzle")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
  });

  it("reads as empty until something is attached, then reads as the attached mod", () => {
    const { rerender } = renderTree();
    expect(within(slotRegion("Muzzle")).getByText(/— empty —/)).toBeInTheDocument();

    rerender(
      <SlotTree tree={DEFAULT_TREE} attachments={{ mod_muzzle: "mod-dtk" }} onAttach={vi.fn()} />,
    );
    const muzzle = slotRegion("Muzzle");
    expect(within(muzzle).queryByText(/— empty —/)).not.toBeInTheDocument();
    // The header now carries the mod name; the option button carries it too, hence getAllBy.
    expect(within(muzzle).getAllByText("Zenit DTK-1 muzzle brake").length).toBeGreaterThan(0);
  });

  it("flags a required slot while it is empty, and stops flagging it once filled", () => {
    const { rerender } = renderTree();
    expect(within(slotRegion("Stock")).getByText("REQUIRED")).toBeInTheDocument();
    expect(within(slotRegion("Muzzle")).queryByText("REQUIRED")).not.toBeInTheDocument();

    rerender(
      <SlotTree tree={DEFAULT_TREE} attachments={{ mod_stock: "mod-stock" }} onAttach={vi.fn()} />,
    );
    expect(within(slotRegion("Stock")).queryByText("REQUIRED")).not.toBeInTheDocument();
  });

  it("counts the options each slot offers, singular and plural", () => {
    renderTree();
    expect(within(slotRegion("Muzzle")).getByText("2 opts")).toBeInTheDocument();
    expect(within(slotRegion("Stock")).getByText("1 opt")).toBeInTheDocument();
  });
});

describe("SlotTree — expanding a slot", () => {
  it("keeps a slot's options out of view until its header is activated", async () => {
    const user = userEvent.setup();
    renderTree();

    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });
    expect(option).not.toBeVisible();

    await openSlot(user, "Muzzle");
    expect(option).toBeVisible();
  });
});

describe("SlotTree — attaching and detaching", () => {
  it("reports the slot path and item id when an option is chosen", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderTree();
    await openSlot(user, "Muzzle");

    await user.click(screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ }));

    expect(onAttach).toHaveBeenCalledWith("mod_muzzle", "mod-dtk");
  });

  it("reports a null item id when the slot is emptied via — none —", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderTree({ attachments: { mod_muzzle: "mod-dtk" } });
    await openSlot(user, "Muzzle");

    await user.click(within(slotRegion("Muzzle")).getByRole("button", { name: /— none —/ }));

    expect(onAttach).toHaveBeenCalledWith("mod_muzzle", null);
  });

  it("offers — none — even on a required slot, so a wrong pick is always reversible", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderTree({ attachments: { mod_stock: "mod-stock" } });
    await openSlot(user, "Stock");

    await user.click(within(slotRegion("Stock")).getByRole("button", { name: /— none —/ }));

    expect(onAttach).toHaveBeenCalledWith("mod_stock", null);
  });
});

describe("SlotTree — nested slots", () => {
  it("reveals an attached mod's own sub-slots, and reports the child path when one is filled", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderTree({ attachments: { mod_muzzle: "mod-adapter" } });

    // The adapter's sub-slot is only reachable because the adapter is attached.
    expect(screen.getByText("Suppressor mount")).toBeInTheDocument();

    await openSlot(user, "Suppressor mount");
    await user.click(screen.getByRole("button", { name: /Nightforce suppressor/ }));

    expect(onAttach).toHaveBeenCalledWith("mod_muzzle/mod_muzzle", "mod-can");
  });

  it("hides sub-slots that belong to a mod that is not attached", () => {
    renderTree({ attachments: { mod_muzzle: "mod-dtk" } });
    // mod-dtk has no children; the adapter's sub-slot must not leak into the tree.
    expect(screen.queryByText("Suppressor mount")).not.toBeInTheDocument();
  });

  it("tracks the child slot's own attachment independently of its parent", () => {
    renderTree({
      attachments: { mod_muzzle: "mod-adapter", "mod_muzzle/mod_muzzle": "mod-can" },
    });
    const child = slotRegion("Suppressor mount");
    expect(within(child).queryByText(/— empty —/)).not.toBeInTheDocument();
    expect(within(child).getAllByText("Nightforce suppressor").length).toBeGreaterThan(0);
  });
});

describe("SlotTree — slots with no concrete options", () => {
  it("names the categories a slot accepts when it has no resolved items", () => {
    const categorySlot = slot("mod_scope", "Scope", [], {
      allowedCategories: [
        { id: "c-1", name: "Assault scope", normalizedName: "assault-scope" },
        { id: "c-2", name: "Reflex sight", normalizedName: "reflex-sight" },
      ],
    });
    render(<SlotTree tree={tree([categorySlot])} attachments={{}} onAttach={vi.fn()} />);

    const region = slotRegion("Scope");
    expect(within(region).getByText(/Assault scope · Reflex sight/)).toBeInTheDocument();
    // Nothing to choose, so no picker is offered at all.
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so plainly when a slot resolves to neither items nor categories", () => {
    const barrenSlot = slot("mod_mount", "Mount", []);
    render(<SlotTree tree={tree([barrenSlot])} attachments={{}} onAttach={vi.fn()} />);

    expect(
      within(slotRegion("Mount")).getByText("No explicit allowed items or categories."),
    ).toBeInTheDocument();
  });
});

describe("SlotTree — availability", () => {
  it("shows no source badge at all when availability is unknown", () => {
    renderTree({ getAvailability: () => null, attachments: { mod_muzzle: "mod-dtk" } });
    expect(screen.queryByText("LOCKED")).not.toBeInTheDocument();
    expect(screen.queryByText("LL1")).not.toBeInTheDocument();
    expect(screen.queryByText("FLEA")).not.toBeInTheDocument();
  });

  it("labels an option reachable from a trader with that trader's loyalty level", () => {
    renderTree({ getAvailability: () => AVAILABLE_TRADER });
    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });
    expect(within(option).getByText("LL1")).toBeInTheDocument();
  });

  it("labels an option reachable only on the flea market as FLEA", () => {
    renderTree({ getAvailability: () => AVAILABLE_FLEA });
    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });
    expect(within(option).getByText("FLEA")).toBeInTheDocument();
  });

  it("carries the attached mod's source badge up into the collapsed slot header", () => {
    renderTree({
      attachments: { mod_muzzle: "mod-dtk" },
      getAvailability: (id) => (id === "mod-dtk" ? AVAILABLE_TRADER : null),
    });
    // Readable without expanding the slot: the header itself reports the source.
    const summary = slotRegion("Muzzle").querySelector("summary");
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText("LL1")).toBeInTheDocument();
  });

  it.each([
    [
      "a trader loyalty level the player has not reached",
      {
        available: false,
        reason: "trader-ll-required",
        traderNormalizedName: "mechanic",
        minLevel: 2,
      },
      "mechanic LL2",
    ],
    [
      "an unfinished quest",
      {
        available: false,
        reason: "quest-required",
        questNormalizedName: "gunsmith-master-part-1",
        traderNormalizedName: "mechanic",
      },
      "Quest: gunsmith-master-part-1",
    ],
    [
      "a flea-market player-level gate",
      { available: false, reason: "flea-level-required", minPlayerLevel: 20 },
      "Flea level 20",
    ],
    ["no flea access", { available: false, reason: "flea-locked" }, "Flea only"],
    ["nothing selling it", { available: false, reason: "no-sources" }, "No sources"],
  ] as const satisfies readonly (readonly [string, ItemAvailability, string])[])(
    "marks an option LOCKED and names the blocker when it is gated by %s",
    (_label, availability, expected) => {
      renderTree({ getAvailability: () => availability });
      const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });
      expect(within(option).getByText("LOCKED")).toBeInTheDocument();
      expect(within(option).getByText(expected)).toBeInTheDocument();
    },
  );

  it("still offers a locked option — gating informs the choice, it does not block it", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderTree({
      getAvailability: () => ({ available: false, reason: "no-sources" }),
    });
    await openSlot(user, "Muzzle");

    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });
    expect(option).toBeEnabled();
    await user.click(option);

    expect(onAttach).toHaveBeenCalledWith("mod_muzzle", "mod-dtk");
  });

  it("keeps the same options and blockers visible whether or not showAll is set", () => {
    // `showAll` only controls how strongly an unreachable option is de-emphasised. It must
    // never remove an option or drop the reason it is unreachable — that would make the
    // toggle a filter, which it is not.
    const gated: ItemAvailability = { available: false, reason: "flea-locked" };
    const { rerender } = renderTree({ getAvailability: () => gated });
    expect(screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ })).toBeInTheDocument();
    expect(screen.getAllByText("Flea only").length).toBe(3);

    rerender(
      <SlotTree
        tree={DEFAULT_TREE}
        attachments={{}}
        onAttach={vi.fn()}
        getAvailability={() => gated}
        showAll
      />,
    );
    expect(screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ })).toBeInTheDocument();
    expect(screen.getAllByText("Flea only").length).toBe(3);
  });
});

describe("SlotTree — compare mode", () => {
  it("stays fully readable and interactive when a slot diff is supplied", async () => {
    // Compare mode annotates rows that differ between two builds. The annotation is a visual
    // cue only, so what is asserted here is the part that must not regress: supplying a diff
    // changes nothing about what the tree shows or what it lets you do.
    const user = userEvent.setup();
    const onAttach = vi.fn();
    render(
      <SlotTree
        tree={DEFAULT_TREE}
        attachments={{ mod_muzzle: "mod-dtk" }}
        onAttach={onAttach}
        diff={
          new Map([
            ["mod_muzzle", "differs"],
            ["mod_stock", "left-only"],
          ])
        }
      />,
    );

    expect(screen.getByText("Muzzle")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();

    await openSlot(user, "Stock");
    await user.click(screen.getByRole("button", { name: /Magpul CTR carbine stock/ }));
    expect(onAttach).toHaveBeenCalledWith("mod_stock", "mod-stock");
  });
});

describe("SlotTree — arrow-key navigation", () => {
  /* Every traversal test below expands the slots it walks through first. That is deliberate,
   * not incidental setup: the arrow-key handler builds its roving-focus list from the DOM
   * without regard to whether a slot is open, so in a real browser the list contains option
   * buttons that a closed <details> has rendered as `display: none`. `HTMLElement.focus()` on
   * an unrendered element is a no-op per spec, so the focus would silently fail to move —
   * whereas jsdom, which does no layout, moves it happily. Asserting traversal across
   * COLLAPSED slots would therefore be asserting a jsdom artefact. See the PR body: the
   * resulting stuck-focus behaviour is a real bug, out of scope for a tests-only change. */

  /** The slot headers, in the order the tree presents them. */
  function headers(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("details > summary"));
  }

  it("walks down and back up an expanded slot's rows with the arrow keys", async () => {
    const user = userEvent.setup();
    renderTree();
    await openSlot(user, "Muzzle");
    const [muzzle] = headers();
    const none = within(slotRegion("Muzzle")).getByRole("button", { name: /— none —/ });
    const dtk = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });

    muzzle.focus();
    await user.keyboard("{ArrowDown}");
    expect(none).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(dtk).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(none).toHaveFocus();
  });

  it("crosses from the last row of one slot into the next slot's header", async () => {
    const user = userEvent.setup();
    renderTree();
    await openSlot(user, "Muzzle");
    const adapter = screen.getByRole("button", { name: /SureFire muzzle adapter/ });
    const stockHeader = headers()[1];

    adapter.focus();
    await user.keyboard("{ArrowDown}");
    expect(stockHeader).toHaveFocus();
  });

  it("stops at the ends instead of wrapping around", async () => {
    const user = userEvent.setup();
    renderTree();
    await openSlot(user, "Muzzle");
    await openSlot(user, "Stock");
    const [muzzle] = headers();
    const lastRow = screen.getByRole("button", { name: /Magpul CTR carbine stock/ });

    muzzle.focus();
    await user.keyboard("{ArrowUp}");
    expect(muzzle).toHaveFocus();

    lastRow.focus();
    await user.keyboard("{ArrowDown}");
    expect(lastRow).toHaveFocus();
  });

  it("steps into an expanded slot's options rather than skipping over them", async () => {
    const user = userEvent.setup();
    renderTree();
    const [muzzle] = headers();

    muzzle.focus();
    await user.keyboard("{ArrowRight}");
    // The slot's options are now reachable, and ArrowDown lands on the first of them.
    await user.keyboard("{ArrowDown}");
    expect(within(slotRegion("Muzzle")).getByRole("button", { name: /— none —/ })).toHaveFocus();
  });

  it("opens a collapsed slot with ArrowRight and closes it again with ArrowLeft", async () => {
    const user = userEvent.setup();
    renderTree();
    const [muzzle] = headers();
    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });

    muzzle.focus();
    await user.keyboard("{ArrowRight}");
    expect(option).toBeVisible();

    await user.keyboard("{ArrowLeft}");
    expect(option).not.toBeVisible();
  });

  it("leaves an already-open slot open on ArrowRight and an already-closed one closed on ArrowLeft", async () => {
    const user = userEvent.setup();
    renderTree();
    const [muzzle] = headers();
    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });

    muzzle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(option).not.toBeVisible();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(option).toBeVisible();
  });

  it("does not expand or collapse a slot when the focus is on an option button", async () => {
    const user = userEvent.setup();
    renderTree();
    await openSlot(user, "Muzzle");
    const none = within(slotRegion("Muzzle")).getByRole("button", { name: /— none —/ });
    const option = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });

    none.focus();
    await user.keyboard("{ArrowLeft}");
    // Still open: ArrowLeft from inside the body must not fold the slot away underneath you.
    expect(option).toBeVisible();
    expect(none).toHaveFocus();
  });

  it("ignores keys that are not arrows", async () => {
    const user = userEvent.setup();
    renderTree();
    const [muzzle] = headers();

    muzzle.focus();
    await user.keyboard("x");
    expect(muzzle).toHaveFocus();
  });
});
