// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useReducer, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { tinyTree } from "../../../test/tiny-tree.js";
import {
  constraintsReducer,
  initialConstraintsState,
  type ConstraintsState,
} from "./optimize-constraints-reducer.js";
import { OptimizePinTree } from "./optimize-pin-tree.js";

afterEach(() => cleanup());

const tree = tinyTree("w", [
  {
    nameId: "receiver",
    name: "Receiver",
    items: [
      [
        "upper",
        [
          { nameId: "barrel", name: "Barrel", items: ["b1", "b2"] },
          { nameId: "mount", name: "Mount", required: true, items: ["m1"] },
        ],
      ],
    ],
  },
  { nameId: "stock", name: "Stock", required: true, items: ["s1"] },
  { nameId: "muzzle", name: "Muzzle", items: ["mz"] },
]);
const NAMES: Record<string, string> = {
  upper: "Upper receiver",
  b1: "Long barrel",
  m1: "Rail mount",
  s1: "Fixed stock",
};
const nameOf = (id: string) => NAMES[id] ?? id;
const BUILD = { receiver: "upper", "receiver/barrel": "b1", "receiver/mount": "m1", stock: "s1" };

/** The tree over a real reducer, with the pins it holds shown for the test to read. */
function Harness({
  start = initialConstraintsState,
  attachments = BUILD,
}: {
  start?: ConstraintsState;
  attachments?: Record<string, string>;
}): ReactElement {
  const [state, dispatch] = useReducer(constraintsReducer, start);
  return (
    <>
      <OptimizePinTree
        slotTree={tree}
        attachments={attachments}
        pinnedSlots={state.pinnedSlots}
        nameOf={nameOf}
        dispatch={dispatch}
      />
      <output data-testid="pins">{JSON.stringify([...state.pinnedSlots])}</output>
    </>
  );
}

const group = (slot: string) => screen.getByRole("radiogroup", { name: `${slot} pin` });
const radio = (slot: string, choice: string) =>
  within(group(slot)).getByRole<HTMLInputElement>("radio", { name: choice });
const pins = () => JSON.parse(screen.getByTestId("pins").textContent) as [string, unknown][];

describe("OptimizePinTree", () => {
  it("lists every slot of the current build, nested under its part, by name, all free", () => {
    render(<Harness />);
    const rows = screen.getAllByRole("radiogroup").map((g) => g.getAttribute("aria-label"));
    expect(rows).toEqual(["Receiver pin", "Barrel pin", "Mount pin", "Stock pin", "Muzzle pin"]);
    const barrel = group("Barrel").closest("li")!;
    expect(barrel).toHaveTextContent("Long barrel");
    expect(barrel).not.toHaveTextContent("b1");
    expect(barrel).toHaveStyle({ paddingLeft: "14px" });
    expect(group("Receiver").closest("li")).toHaveStyle({ paddingLeft: "0px" });
    expect(group("Muzzle").closest("li")).toHaveTextContent("empty");
    expect(screen.getByText("Nothing pinned")).toBeInTheDocument();
    for (const slot of ["Receiver", "Barrel", "Mount", "Stock", "Muzzle"]) {
      expect(radio(slot, "Free")).toBeChecked();
    }
  });

  it("locks a nested slot to the build's part, and Free removes the pin rather than emptying it", () => {
    render(<Harness />);
    fireEvent.click(radio("Barrel", "Lock"));
    expect(pins()).toEqual([["receiver/barrel", "b1"]]);
    expect(screen.getByText("1 slot pinned")).toBeInTheDocument();
    fireEvent.click(radio("Barrel", "Free"));
    expect(pins()).toEqual([]);
    expect(radio("Barrel", "Free")).toBeChecked();
  });

  it("can't lock an empty slot or empty a required one", () => {
    render(<Harness />);
    expect(radio("Muzzle", "Lock")).toBeDisabled();
    expect(radio("Muzzle", "Empty")).toBeEnabled();
    expect(radio("Stock", "Empty")).toBeDisabled();
    expect(radio("Mount", "Empty")).toBeDisabled();
    expect(radio("Stock", "Lock")).toBeEnabled();
  });

  it("Empty on a slot clears the locks below it, and its nested rows leave the list", () => {
    render(<Harness />);
    fireEvent.click(radio("Barrel", "Lock"));
    fireEvent.click(radio("Mount", "Lock"));
    fireEvent.click(radio("Stock", "Lock"));
    expect(pins()).toHaveLength(3);
    fireEvent.click(radio("Receiver", "Empty"));
    fireEvent.click(screen.getByRole("button", { name: "Empty it" }));
    expect(pins()).toEqual([
      ["stock", "s1"],
      ["receiver", null],
    ]);
    expect(screen.queryByRole("radiogroup", { name: "Barrel pin" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Mount pin" })).toBeNull();
    expect(group("Receiver").closest("li")).toHaveTextContent("left empty");
    // Freed again, the nested slots come back free: nothing was kept out of sight.
    fireEvent.click(radio("Receiver", "Free"));
    expect(radio("Barrel", "Free")).toBeChecked();
    expect(radio("Mount", "Free")).toBeChecked();
  });

  it("asks before Empty clears pins below, so an arrow key passing over it wipes nothing", () => {
    render(<Harness />);
    fireEvent.click(radio("Barrel", "Lock"));
    fireEvent.click(radio("Mount", "Lock"));
    // Arrowing through the radios checks each in turn: landing on EMPTY only asks.
    fireEvent.click(radio("Receiver", "Empty"));
    const ask = screen.getByRole("group", { name: "Empty Receiver" });
    expect(ask).toHaveTextContent("Emptying Receiver clears 2 pins below it.");
    expect(pins()).toEqual([
      ["receiver/barrel", "b1"],
      ["receiver/mount", "m1"],
    ]);
    expect(radio("Receiver", "Free")).toBeChecked();
    expect(radio("Receiver", "Empty")).not.toBeChecked();
    // Moving on to another choice drops the question and keeps the pins below.
    fireEvent.click(radio("Receiver", "Lock"));
    expect(screen.queryByRole("group", { name: "Empty Receiver" })).toBeNull();
    expect(pins()).toEqual([
      ["receiver/barrel", "b1"],
      ["receiver/mount", "m1"],
      ["receiver", "upper"],
    ]);
    fireEvent.click(radio("Receiver", "Empty"));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Empty Receiver" })).getByRole("button", {
        name: "Keep pins",
      }),
    );
    expect(screen.queryByRole("group", { name: "Empty Receiver" })).toBeNull();
    expect(pins()).toHaveLength(3);
    expect(radio("Receiver", "Lock")).toBeChecked();
  });

  it("empties a slot with no pins below it at once", () => {
    render(<Harness />);
    fireEvent.click(radio("Receiver", "Empty"));
    expect(screen.queryByRole("group", { name: "Empty Receiver" })).toBeNull();
    expect(pins()).toEqual([["receiver", null]]);
  });

  it("lists a pin the current build doesn't show, by name, so it can be freed", () => {
    render(
      <Harness
        start={{
          ...initialConstraintsState,
          pinnedSlots: new Map<string, string | null>([
            ["receiver/barrel", "b2"],
            ["stock", "s1"],
          ]),
        }}
        attachments={{ stock: "s1" }}
      />,
    );
    const free = screen.getByRole("button", { name: "Free Receiver › barrel" });
    expect(free.closest("li")).toHaveTextContent("b2 · not on this build");
    fireEvent.click(free);
    expect(pins()).toEqual([["stock", "s1"]]);
  });

  it("shows a lock's own part, and Clear all frees every slot", () => {
    render(
      <Harness
        start={{
          ...initialConstraintsState,
          pinnedSlots: new Map<string, string | null>([
            ["receiver/barrel", "b2"],
            ["muzzle", null],
          ]),
        }}
      />,
    );
    // Locked on another barrel than the build now has: the lock's part is what it keeps.
    expect(group("Barrel").closest("li")).toHaveTextContent("b2");
    expect(radio("Barrel", "Lock")).toBeChecked();
    expect(screen.getByText("2 slots pinned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(pins()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });
});
