// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BuilderMode } from "@tarkov/data";
import type { PricesStatus } from "./build-price.js";
import { usePendingSeed } from "./usePendingSeed.js";

afterEach(() => cleanup());

const LOADING: PricesStatus = { state: "loading" };
const READY: PricesStatus = { state: "ready", asOf: "2026-10-17T00:00:00.000Z" };
const FAILED: PricesStatus = { state: "error", message: "prices down" };

function setup(start: { mode?: BuilderMode; prices?: PricesStatus; weaponId?: string } = {}) {
  const reseed = vi.fn();
  const props = { mode: "progression" as BuilderMode, prices: LOADING, weaponId: "w", ...start };
  const hook = renderHook((p: typeof props) => usePendingSeed({ ...p, reseed }), {
    initialProps: props,
  });
  return { reseed, props, ...hook };
}

describe("usePendingSeed", () => {
  it("redoes a progression seed made while prices load, once, when they arrive", () => {
    const { reseed, props, result, rerender } = setup();
    act(() => result.current.seeded("w"));
    expect(reseed).not.toHaveBeenCalled();
    rerender({ ...props, prices: READY });
    expect(reseed).toHaveBeenCalledTimes(1);
    expect(reseed).toHaveBeenCalledWith("w");
    rerender({ ...props, prices: READY });
    expect(reseed).toHaveBeenCalledTimes(1);
  });

  it("never redoes a seed that was cleared by an edit or a commit", () => {
    const { reseed, props, result, rerender } = setup();
    act(() => result.current.seeded("w"));
    act(() => result.current.clear());
    rerender({ ...props, prices: READY });
    expect(reseed).not.toHaveBeenCalled();
  });

  it("waits for nothing when prices are already in, or in theorycraft", () => {
    const ready = setup({ prices: READY });
    act(() => ready.result.current.seeded("w"));
    ready.rerender({ ...ready.props });
    expect(ready.reseed).not.toHaveBeenCalled();

    const tc = setup({ mode: "theorycraft" });
    act(() => tc.result.current.seeded("w"));
    tc.rerender({ ...tc.props, prices: READY });
    expect(tc.reseed).not.toHaveBeenCalled();
  });

  it("drops the redo on a switch to theorycraft, a price failure, or another weapon", () => {
    for (const change of [
      { mode: "theorycraft" as BuilderMode },
      { prices: FAILED },
      { weaponId: "other" },
    ]) {
      const { reseed, props, result, rerender } = setup();
      act(() => result.current.seeded("w"));
      rerender({ ...props, ...change });
      rerender({ ...props, ...change, prices: READY });
      expect(reseed).not.toHaveBeenCalled();
    }
  });
});
