// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { OptimizeTriptych } from "./optimize-triptych.js";
import type { WeaponSpec } from "@tarkov/ballistics";

const current: WeaponSpec = {
  ergonomics: 50,
  verticalRecoil: 150,
  horizontalRecoil: 300,
  weight: 3.5,
  accuracy: 2.5,
  modCount: 5,
} as WeaponSpec;

const optimized: WeaponSpec = {
  ergonomics: 58,
  verticalRecoil: 120,
  horizontalRecoil: 260,
  weight: 3.1,
  accuracy: 2.2,
  modCount: 6,
} as WeaponSpec;

describe("OptimizeTriptych", () => {
  it("renders CURRENT numerics, OPTIMIZED numerics, and derived DELTA numerics", () => {
    const { getByTestId } = render(
      <OptimizeTriptych
        current={current}
        optimized={optimized}
        priceCurrent={250_000}
        priceOptimized={200_000}
      />,
    );
    expect(getByTestId("triptych-current-ergo").textContent).toContain("50");
    expect(getByTestId("triptych-optimized-ergo").textContent).toContain("58");
    // Delta: +8 ergo (higher-is-better → olive)
    const deltaErgo = getByTestId("triptych-delta-ergo");
    expect(deltaErgo.textContent).toContain("+8");
    expect(deltaErgo.className).toContain("text-[var(--color-better)]");
    // MOA, lower is better: 2.50 → 2.20 is an improvement.
    expect(getByTestId("triptych-current-moa").textContent).toBe("2.50");
    expect(getByTestId("triptych-optimized-moa").textContent).toBe("2.20");
    expect(getByTestId("triptych-delta-moa").textContent).toBe("−0.30");
    expect(getByTestId("triptych-delta-moa").className).toContain("text-[var(--color-better)]");
  });

  it("shows ergonomics below 0 as 0 with the raw sum in a title, and deltas the floored values", () => {
    const { getByTestId } = render(
      <OptimizeTriptych
        current={{ ...current, ergonomics: 55 }}
        optimized={{ ...optimized, ergonomics: -23 }}
        priceCurrent={null}
        priceOptimized={null}
      />,
    );
    expect(getByTestId("triptych-current-ergo").textContent).toBe("55");
    expect(getByTestId("triptych-current-ergo")).not.toHaveAttribute("title");
    const shown = getByTestId("triptych-optimized-ergo");
    expect(shown.textContent).toBe("0");
    expect(shown).toHaveAttribute("title", "−23 before the game's floor at 0");
    // 55 → 0 as the game sees it, not 55 → −23.
    expect(getByTestId("triptych-delta-ergo").textContent).toBe("−55");
  });

  it("renders — placeholders when optimized is null (idle state)", () => {
    const { getAllByText } = render(
      <OptimizeTriptych
        current={current}
        optimized={null}
        priceCurrent={250_000}
        priceOptimized={null}
      />,
    );
    // 5 stats in OPTIMIZED card + 5 in DELTA card = 10 placeholders.
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(10);
  });

  it("colours recoil improvement (lower) as better and regression (higher) as worse", () => {
    const { getByTestId } = render(
      <OptimizeTriptych
        current={current}
        optimized={{ ...optimized, verticalRecoil: 160 }}
        priceCurrent={100}
        priceOptimized={100}
      />,
    );
    const deltaRecoil = getByTestId("triptych-delta-recoil");
    expect(deltaRecoil.textContent).toContain("+10");
    expect(deltaRecoil.className).toContain("text-[var(--color-worse)]");
  });
});
