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
  it("offers min recoil, max ergonomics and min weight, and not max accuracy", () => {
    render(
      <OptimizeConstraintsForm
        state={initialConstraintsState}
        dispatch={() => {}}
        slotTree={TREE}
      />,
    );
    const offered = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value);
    expect(offered).toEqual(["min-recoil", "max-ergonomics", "min-weight"]);
    expect(screen.queryByText("Max accuracy")).not.toBeInTheDocument();
  });
});
