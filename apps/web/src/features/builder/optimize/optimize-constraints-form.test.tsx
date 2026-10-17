// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WeaponTree } from "@tarkov/data";
import { OptimizeConstraintsForm } from "./optimize-constraints-form.js";
import { initialConstraintsState } from "./optimize-constraints-reducer.js";

afterEach(() => cleanup());

const TREE = { weaponId: "w1", weaponName: "W", slots: [] } as unknown as WeaponTree;

describe("OptimizeConstraintsForm", () => {
  it("offers all four objectives", () => {
    render(
      <OptimizeConstraintsForm
        state={initialConstraintsState}
        dispatch={() => {}}
        slotTree={TREE}
      />,
    );
    const offered = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value);
    expect(offered).toEqual(["min-recoil", "max-ergonomics", "min-weight", "max-accuracy"]);
    expect(screen.getByText("Max accuracy")).toBeInTheDocument();
  });
});
