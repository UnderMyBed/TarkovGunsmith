// @vitest-environment jsdom
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
    expect(deltaErgo.className).toContain("text-[var(--color-olive)]");
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
    // 4 stats in OPTIMIZED card + 4 in DELTA card = 8 placeholders.
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(8);
  });

  it("colours recoil improvement (lower) as olive and regression (higher) as destructive", () => {
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
    expect(deltaRecoil.className).toContain("text-[var(--color-destructive)]");
  });
});
