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
      expect(radio(slot, "FREE")).toBeChecked();
    }
  });

  it("locks a nested slot to the build's part, and FREE removes the pin rather than emptying it", () => {
    render(<Harness />);
    fireEvent.click(radio("Barrel", "LOCK"));
    expect(pins()).toEqual([["receiver/barrel", "b1"]]);
    expect(screen.getByText("1 slot pinned")).toBeInTheDocument();
    fireEvent.click(radio("Barrel", "FREE"));
    expect(pins()).toEqual([]);
    expect(radio("Barrel", "FREE")).toBeChecked();
  });

  it("can't lock an empty slot or empty a required one", () => {
    render(<Harness />);
    expect(radio("Muzzle", "LOCK")).toBeDisabled();
    expect(radio("Muzzle", "EMPTY")).toBeEnabled();
    expect(radio("Stock", "EMPTY")).toBeDisabled();
    expect(radio("Mount", "EMPTY")).toBeDisabled();
    expect(radio("Stock", "LOCK")).toBeEnabled();
  });

  it("EMPTY on a slot clears the locks below it, and its nested rows leave the list", () => {
    render(<Harness />);
    fireEvent.click(radio("Barrel", "LOCK"));
    fireEvent.click(radio("Mount", "LOCK"));
    fireEvent.click(radio("Stock", "LOCK"));
    expect(pins()).toHaveLength(3);
    fireEvent.click(radio("Receiver", "EMPTY"));
    expect(pins()).toEqual([
      ["stock", "s1"],
      ["receiver", null],
    ]);
    expect(screen.queryByRole("radiogroup", { name: "Barrel pin" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Mount pin" })).toBeNull();
    expect(group("Receiver").closest("li")).toHaveTextContent("left empty");
    // Freed again, the nested slots come back free: nothing was kept out of sight.
    fireEvent.click(radio("Receiver", "FREE"));
    expect(radio("Barrel", "FREE")).toBeChecked();
    expect(radio("Mount", "FREE")).toBeChecked();
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

  it("shows a lock's own part, and CLEAR ALL frees every slot", () => {
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
    expect(radio("Barrel", "LOCK")).toBeChecked();
    expect(screen.getByText("2 slots pinned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CLEAR ALL" }));
    expect(pins()).toEqual([]);
    expect(screen.queryByRole("button", { name: "CLEAR ALL" })).toBeNull();
  });
});
