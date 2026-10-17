// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  buildBuilderSnapshot,
  staticBuilderDataSource,
  TarkovDataProvider,
  type AttachablePart,
  type ItemAvailability,
  type SlotNode,
  type TarkovJsonClient,
} from "@tarkov/data";
import { tinyTree, type SlotSpec } from "../../test/tiny-tree.js";
import { QuestNameProvider } from "./quest-names.js";
import { SlotInspector, type SlotInspectorProps } from "./slot-inspector.js";

afterEach(() => cleanup());

/* The inspector as a user meets it: the slot's parts with their figures and sources, the
 * reasons a part is locked or clashes, search and sort, Fit / Fitted / Remove, and the keys
 * that leave it. */

const NAMES = {
  "grip-a2": "Colt A2 pistol grip",
  "grip-miad": "Magpul MIAD pistol grip",
  "grip-hera": "Hera Arms CQR grip",
};

function slot(spec: Partial<SlotSpec> = {}): SlotNode {
  return tinyTree(
    "w",
    [{ nameId: "mod_pistol_grip", name: "Pistol grip", items: Object.keys(NAMES), ...spec }],
    NAMES,
  ).slots[0]!;
}

function part(id: string, ergonomics: number, recoilModifier: number, weight: number) {
  return {
    id,
    name: NAMES[id as keyof typeof NAMES],
    shortName: id,
    iconLink: "https://assets.tarkov.dev/x.webp",
    weight,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics,
      recoilModifier,
      accuracyModifier: 0,
      velocity: 0,
    },
    conflictingItems: [],
    conflictingSlotIds: [],
    buyFor: null,
  } satisfies AttachablePart;
}

const PARTS: ReadonlyMap<string, AttachablePart> = new Map([
  ["grip-a2", part("grip-a2", 0, 0, 0.08)],
  ["grip-miad", part("grip-miad", 3, -0.012, 0.05)],
  ["grip-hera", part("grip-hera", 12, -0.23, 0.5)],
]);

const trader = (name: string, minLevel: number, priceRUB: number | null): ItemAvailability => ({
  available: true,
  kind: "trader",
  traderNormalizedName: name,
  minLevel,
  priceRUB,
  preset: null,
  assumedQuest: null,
});

function renderInspector(props: Partial<SlotInspectorProps> = {}) {
  const onAttach = vi.fn();
  const onEscape = vi.fn();
  const utils = render(
    <SlotInspector
      slot={slot()}
      fittedId="grip-a2"
      parts={PARTS}
      onAttach={onAttach}
      getAvailability={() => null}
      mode="progression"
      pricesReady={false}
      onEscape={onEscape}
      {...props}
    />,
  );
  return { onAttach, onEscape, ...utils };
}

/** The list row of the part whose name starts with `name`. */
function partRow(name: string): HTMLElement {
  const row = screen
    .getAllByRole("listitem")
    .find((li) => li.querySelector("span")?.textContent?.startsWith(name));
  if (!row) throw new Error(`no part row for "${name}"`);
  return row;
}

function names(): string[] {
  return screen.getAllByRole("listitem").map((li) => li.querySelector("span")?.textContent ?? "");
}

describe("SlotInspector — header", () => {
  it("names the slot, whether it is required, its option count and the fitted part", () => {
    renderInspector({ slot: slot({ required: true }) });
    const region = screen.getByRole("region", { name: "Pistol grip options" });
    expect(within(region).getByRole("heading")).toHaveTextContent(
      "Pistol grip required · 3 options",
    );
    expect(within(region).getByText("Fitted: Colt A2 pistol grip")).toBeInTheDocument();
  });

  it("says when nothing is fitted, and counts one option in the singular", () => {
    renderInspector({ slot: slot({ items: ["grip-a2"] }), fittedId: null });
    expect(screen.getByRole("heading")).toHaveTextContent("Pistol grip 1 option");
    expect(screen.getByText("Nothing fitted")).toBeInTheDocument();
  });
});

describe("SlotInspector — fitting", () => {
  it("reports the slot path and part id when Fit is pressed", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderInspector();
    await user.click(screen.getByRole("button", { name: "Fit Magpul MIAD pistol grip" }));
    expect(onAttach).toHaveBeenCalledWith("mod_pistol_grip", "grip-miad");
  });

  it("marks the fitted part Fitted, which does nothing when pressed", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderInspector();
    const fitted = screen.getByRole("button", { name: "Fitted: Colt A2 pistol grip" });
    expect(fitted).toHaveTextContent("Fitted");
    expect(fitted).toHaveAttribute("aria-disabled", "true");
    await user.click(fitted);
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("offers Remove on an optional slot with a part fitted, reporting a null part", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderInspector();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onAttach).toHaveBeenCalledWith("mod_pistol_grip", null);
  });

  it("keeps the focus in the inspector after Remove, on the search", async () => {
    const user = userEvent.setup();
    const props = {
      slot: slot(),
      parts: PARTS,
      getAvailability: () => null,
      mode: "progression" as const,
      pricesReady: false,
    };
    let fitted: string | null = "grip-a2";
    const { rerender } = render(
      <SlotInspector {...props} fittedId={fitted} onAttach={(_p, id) => (fitted = id)} />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    rerender(<SlotInspector {...props} fittedId={fitted} onAttach={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveFocus();
  });

  it("offers no Remove on a required slot, nor on an empty one", () => {
    const { unmount } = renderInspector({ slot: slot({ required: true }) });
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    unmount();
    renderInspector({ fittedId: null });
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});

describe("SlotInspector — figures", () => {
  it("shows ergonomics against the fitted part, the part's own recoil, and weight", () => {
    renderInspector();
    const hera = partRow("Hera Arms CQR grip");
    // +12 ergonomics over the A2's 0, spoken as better; −23% recoil, also better.
    expect(hera).toHaveTextContent("+12 better");
    expect(hera).toHaveTextContent("−23% better");
    expect(hera).toHaveTextContent("0.50 kg");
    const a2 = partRow("Colt A2 pistol grip");
    expect(a2).toHaveTextContent(/^Colt A2 pistol grip0 ergo0% recoil0\.08 kg/);
  });

  it("measures ergonomics against an empty slot when nothing is fitted", () => {
    renderInspector({ fittedId: "grip-hera" });
    expect(partRow("Colt A2 pistol grip")).toHaveTextContent("−12 worse");
  });

  it("shows a dash for a part it has no figures for", () => {
    renderInspector({ parts: new Map() });
    expect(partRow("Colt A2 pistol grip")).toHaveTextContent("— ergo— recoil— kg");
  });
});

describe("SlotInspector — search and sort", () => {
  it("narrows the list by name and says how many are shown", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "magpul");
    expect(names()).toEqual(["Magpul MIAD pistol grip"]);
    expect(screen.getByText(/^Showing/)).toHaveTextContent("Showing 1 of 3");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "zzz");
    expect(screen.getByText("No part matches “zzz”.")).toBeInTheDocument();
  });

  it("starts a new slot with no search", async () => {
    const user = userEvent.setup();
    const { rerender } = renderInspector();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "magpul");
    const other = { ...slot(), path: "mod_stock", label: "Stock" };
    rerender(
      <SlotInspector
        slot={other}
        fittedId={null}
        parts={PARTS}
        onAttach={vi.fn()}
        getAvailability={() => null}
        mode="progression"
        pricesReady={false}
      />,
    );
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    expect(names()).toHaveLength(3);
  });

  it("sorts best ergonomics first, then by recoil and weight on request", async () => {
    const user = userEvent.setup();
    renderInspector();
    expect(names()).toEqual([
      "Hera Arms CQR grip",
      "Magpul MIAD pistol grip",
      "Colt A2 pistol grip",
    ]);
    const sort = screen.getByRole("combobox", { name: "Sort by" });
    await user.selectOptions(sort, "Recoil");
    expect(names()).toEqual([
      "Hera Arms CQR grip",
      "Magpul MIAD pistol grip",
      "Colt A2 pistol grip",
    ]);
    await user.selectOptions(sort, "Weight");
    expect(names()).toEqual([
      "Magpul MIAD pistol grip",
      "Colt A2 pistol grip",
      "Hera Arms CQR grip",
    ]);
  });

  it("offers price only once prices are in, cheapest first and unpriced last", async () => {
    const user = userEvent.setup();
    const prices: Record<string, number | null> = {
      "grip-a2": 2500,
      "grip-miad": null,
      "grip-hera": 900,
    };
    const { rerender } = renderInspector({
      getAvailability: (id) => trader("peacekeeper", 1, prices[id] ?? null),
    });
    expect(screen.queryByRole("option", { name: "Price" })).not.toBeInTheDocument();
    rerender(
      <SlotInspector
        slot={slot()}
        fittedId="grip-a2"
        parts={PARTS}
        onAttach={vi.fn()}
        getAvailability={(id) => trader("peacekeeper", 1, prices[id] ?? null)}
        mode="progression"
        pricesReady
      />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Price");
    expect(names()).toEqual([
      "Hera Arms CQR grip",
      "Colt A2 pistol grip",
      "Magpul MIAD pistol grip",
    ]);
  });
});

describe("SlotInspector — where to get it", () => {
  it("names the trader and level, a barter, or the flea market", () => {
    renderInspector({
      getAvailability: (id) =>
        id === "grip-a2"
          ? trader("peacekeeper", 1, 2500)
          : id === "grip-miad"
            ? {
                available: true,
                kind: "barter",
                traderNormalizedName: "ref",
                minLevel: 3,
                priceRUB: null,
                barterId: "b",
                preset: null,
                assumedQuest: null,
              }
            : { available: true, kind: "flea", priceRUB: 63_000 },
    });
    expect(within(partRow("Colt A2 pistol grip")).getByText("Peacekeeper")).toBeInTheDocument();
    expect(within(partRow("Colt A2 pistol grip")).getByText("LL1")).toBeInTheDocument();
    expect(within(partRow("Magpul MIAD")).getByText("Ref")).toBeInTheDocument();
    expect(within(partRow("Magpul MIAD")).getByText("LL3 barter")).toBeInTheDocument();
    expect(within(partRow("Hera Arms")).getByText("Flea")).toBeInTheDocument();
  });

  it.each([
    [
      "a trader loyalty level the player has not reached",
      {
        available: false,
        reason: "trader-ll-required",
        traderNormalizedName: "mechanic",
        minLevel: 2,
        payment: "cash",
        preset: null,
      },
      "mechanic LL2",
    ],
    [
      "a trader loyalty level on a barter",
      {
        available: false,
        reason: "trader-ll-required",
        traderNormalizedName: "peacekeeper",
        minLevel: 2,
        payment: "barter",
        preset: null,
      },
      "peacekeeper LL2 barter",
    ],
    [
      "an unfinished quest",
      {
        available: false,
        reason: "quest-required",
        questNormalizedName: "gunsmith-master-part-1",
        traderNormalizedName: "mechanic",
        payment: "cash",
        preset: null,
      },
      // Outside a QuestNameProvider no name is known; the slug is never shown.
      "Quest",
    ],
    [
      "a flea-market player-level gate",
      { available: false, reason: "flea-level-required", minPlayerLevel: 20 },
      "Flea level 20",
    ],
    ["no flea access", { available: false, reason: "flea-locked" }, "Flea only"],
    [
      "a trader the profile does not track",
      {
        available: false,
        reason: "untracked-trader",
        traderNormalizedName: "ref",
        minLevel: 3,
        payment: "barter",
      },
      "ref LL3 (not in profile)",
    ],
    ["nothing selling it", { available: false, reason: "no-sources" }, "No sources"],
  ] as const satisfies readonly (readonly [string, ItemAvailability, string])[])(
    "marks a part Locked and names the blocker when it is gated by %s",
    (_label, availability, expected) => {
      renderInspector({ getAvailability: () => availability });
      const miad = partRow("Magpul MIAD pistol grip");
      expect(within(miad).getByText("Locked")).toBeInTheDocument();
      expect(within(miad).getByText(expected)).toBeInTheDocument();
    },
  );

  it("still lets a locked part be fitted: gating informs the choice, it does not block it", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderInspector({
      getAvailability: () => ({ available: false, reason: "no-sources" }),
    });
    const fit = screen.getByRole("button", { name: "Fit Magpul MIAD pistol grip" });
    expect(fit).toBeEnabled();
    await user.click(fit);
    expect(onAttach).toHaveBeenCalledWith("mod_pistol_grip", "grip-miad");
  });

  it("in progression, dims a locked part unless Show all items is on, keeping its reason", async () => {
    const user = userEvent.setup();
    renderInspector({ getAvailability: () => ({ available: false, reason: "flea-locked" }) });
    const nameCell = () =>
      within(partRow("Magpul MIAD")).getByText("Magpul MIAD pistol grip")
        .parentElement as HTMLElement;
    // Dimming has no accessible signal; its class is the only observable.
    expect(nameCell()).toHaveClass("opacity-40");
    await user.click(screen.getByLabelText("Show all items"));
    expect(nameCell()).not.toHaveClass("opacity-40");
    expect(within(partRow("Magpul MIAD")).getByText("Flea only")).toBeInTheDocument();
  });

  it("in theorycraft, shows a part nobody sells neither dimmed nor Locked", () => {
    renderInspector({
      mode: "theorycraft",
      getAvailability: (id) =>
        id === "grip-miad" ? { available: false, reason: "no-sources" } : trader("prapor", 1, 1),
    });
    const miad = partRow("Magpul MIAD");
    expect(within(miad).queryByText("Locked")).not.toBeInTheDocument();
    expect(within(miad).queryByText("No sources")).not.toBeInTheDocument();
    expect(within(miad).getByText("Magpul MIAD pistol grip").parentElement).not.toHaveClass(
      "opacity-40",
    );
    expect(within(partRow("Hera Arms")).getByText("LL1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Show all items")).not.toBeInTheDocument();
  });
});

describe("SlotInspector — conflicts", () => {
  const getConflict = (_path: string, id: string) =>
    id === "grip-miad" || id === "grip-a2" ? "Conflicts with CTR" : null;

  it("disables a clashing part's Fit, with the reason, and dims it even in theorycraft", async () => {
    const user = userEvent.setup();
    const { onAttach } = renderInspector({ getConflict, mode: "theorycraft" });
    const fit = screen.getByRole("button", { name: "Fit Magpul MIAD pistol grip" });
    expect(fit).toBeDisabled();
    expect(within(partRow("Magpul MIAD")).getByText("Conflicts with CTR")).toBeInTheDocument();
    expect(
      within(partRow("Magpul MIAD")).getByText("Magpul MIAD pistol grip").parentElement,
    ).toHaveClass("opacity-40");
    await user.click(fit);
    expect(onAttach).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fit Hera Arms CQR grip" })).toBeEnabled();
  });

  it("never marks the fitted part as clashing", () => {
    renderInspector({ getConflict });
    expect(within(partRow("Colt A2")).queryByText("Conflicts with CTR")).not.toBeInTheDocument();
  });

  it("shows a locked, clashing part's two reasons", () => {
    renderInspector({
      getConflict,
      getAvailability: () => ({ available: false, reason: "flea-locked" }),
    });
    const miad = partRow("Magpul MIAD");
    expect(within(miad).getByText("Conflicts with CTR")).toBeInTheDocument();
    expect(within(miad).getByText("Flea only")).toBeInTheDocument();
  });
});

describe("SlotInspector — slots with no concrete parts", () => {
  it("names the categories a slot accepts when it has no resolved items", () => {
    renderInspector({
      fittedId: null,
      slot: slot({
        items: [],
        allowedCategories: [
          { id: "c-1", name: "Assault scope", normalizedName: "assault-scope" },
          { id: "c-2", name: "Reflex sight", normalizedName: "reflex-sight" },
        ],
      }),
    });
    expect(screen.getByText(/Assault scope · Reflex sight/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("says so plainly when a slot resolves to neither items nor categories", () => {
    renderInspector({ fittedId: null, slot: slot({ items: [] }) });
    expect(screen.getByText("No explicit allowed items or categories.")).toBeInTheDocument();
  });
});

describe("SlotInspector — keyboard", () => {
  it("hands Escape to its owner, from the search or a part", async () => {
    const user = userEvent.setup();
    const { onEscape } = renderInspector();
    await user.click(screen.getByRole("searchbox", { name: "Search" }));
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Fit Hera Arms CQR grip" }).focus();
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(2);
  });

  it("moves between the parts' actions with the arrows, skipping a disabled one", async () => {
    const user = userEvent.setup();
    renderInspector({
      getConflict: (_p, id) => (id === "grip-miad" ? "Conflicts with CTR" : null),
    });
    const hera = screen.getByRole("button", { name: "Fit Hera Arms CQR grip" });
    const a2 = screen.getByRole("button", { name: "Fitted: Colt A2 pistol grip" });
    hera.focus();
    await user.keyboard("{ArrowDown}");
    expect(a2).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(hera).toHaveFocus();
  });
});

describe("SlotInspector — quests", () => {
  function renderWithQuests(getAvailability: (id: string) => ItemAvailability | null) {
    const { snapshot, prices } = buildBuilderSnapshot(
      {
        items: { items: { stamp: { id: "stamp", updated: "2026-10-16T00:00:00.000Z" } } },
        tasks: { tasks: {} },
        traders: {},
        barters: [],
      },
      "fixtures",
    );
    const builderData = staticBuilderDataSource(
      {
        ...snapshot,
        tasks: [
          {
            id: "5a03296886f774569778596a",
            name: "I Need More Power",
            normalizedName: "i-need-more-power",
            kappaRequired: false,
            trader: { normalizedName: "peacekeeper" },
          },
        ],
      },
      prices,
    );
    const noClient: TarkovJsonClient = {
      fetchResource: (resource) => Promise.reject(new Error(`unexpected fetch of ${resource}`)),
    };
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <TarkovDataProvider client={noClient} builderData={builderData}>
          <QuestNameProvider>
            <SlotInspector
              slot={slot()}
              fittedId={null}
              parts={PARTS}
              onAttach={vi.fn()}
              getAvailability={getAvailability}
              mode="progression"
              pricesReady={false}
            />
          </QuestNameProvider>
        </TarkovDataProvider>
      </QueryClientProvider>,
    );
  }

  it("marks a part whose quest basic mode assumes, and names the quest", async () => {
    renderWithQuests(() => ({ ...trader("peacekeeper", 3, 1), assumedQuest: "i-need-more-power" }));
    const miad = partRow("Magpul MIAD");
    const pill = within(miad).getByText("LL3 · quest");
    expect(await within(miad).findByTitle("Assumes I Need More Power is complete")).toBe(pill);
  });

  it("names a missing quest by its display name, never its slug", async () => {
    renderWithQuests(() => ({
      available: false,
      reason: "quest-required",
      questNormalizedName: "i-need-more-power",
      traderNormalizedName: "peacekeeper",
      payment: "cash",
      preset: null,
    }));
    const miad = partRow("Magpul MIAD");
    expect(await within(miad).findByText("Quest: I Need More Power")).toBeInTheDocument();
    expect(within(miad).queryByText(/i-need-more-power/)).not.toBeInTheDocument();
  });
});
