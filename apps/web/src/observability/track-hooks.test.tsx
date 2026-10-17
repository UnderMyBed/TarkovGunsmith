// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Progression } from "@tarkov/data";
import { useModeChangedEvent, useTrackOnce } from "./track-hooks.js";
import { connectTracking, resetTrackingForTests } from "./track.js";

afterEach(() => resetTrackingForTests());

function sink() {
  const fn = vi.fn();
  connectTracking(fn);
  return fn;
}

describe("useModeChangedEvent", () => {
  it("reports changes of mode, not the mode the page opens in", () => {
    const events = sink();
    const { rerender } = renderHook(({ mode }) => useModeChangedEvent(mode), {
      initialProps: { mode: "theorycraft" as Progression["mode"] },
    });
    expect(events).not.toHaveBeenCalled();
    rerender({ mode: "progression" });
    rerender({ mode: "progression" });
    rerender({ mode: "theorycraft" });
    expect(events.mock.calls).toEqual([
      ["mode_changed", { mode: "progression" }],
      ["mode_changed", { mode: "theorycraft" }],
    ]);
  });
});

describe("useTrackOnce", () => {
  it("sends once, the first time its condition holds", () => {
    const events = sink();
    const { rerender } = renderHook(
      ({ when }) => useTrackOnce(when, "build_loaded", { source: "link" }),
      { initialProps: { when: false } },
    );
    expect(events).not.toHaveBeenCalled();
    rerender({ when: true });
    rerender({ when: false });
    rerender({ when: true });
    expect(events.mock.calls).toEqual([["build_loaded", { source: "link" }]]);
  });
});
