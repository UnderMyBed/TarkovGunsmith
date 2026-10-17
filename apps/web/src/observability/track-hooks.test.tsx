// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useProgression, type Progression } from "@tarkov/data";
import { useTrackOnce, withModeTracking } from "./track-hooks.js";
import { connectTracking, resetTrackingForTests } from "./track.js";

afterEach(() => resetTrackingForTests());

function sink() {
  const fn = vi.fn();
  connectTracking(fn);
  return fn;
}

describe("withModeTracking", () => {
  function progression(mode: Progression["mode"]) {
    return {
      profile: {} as Progression["profile"],
      hasProfile: true,
      mode,
      setMode: vi.fn(),
      setProfile: vi.fn(),
      updateProfile: vi.fn(),
    } satisfies Progression;
  }

  it("sends mode_changed when this tab's switch changes the mode, and still switches", () => {
    const events = sink();
    const base = progression("theorycraft");
    const tracked = withModeTracking(base);
    tracked.setMode("theorycraft");
    tracked.setMode("progression");
    expect(events.mock.calls).toEqual([["mode_changed", { mode: "progression" }]]);
    expect(base.setMode.mock.calls).toEqual([["theorycraft"], ["progression"]]);
  });

  it("sends mode_changed when setting a profile moves this tab to progression", () => {
    const events = sink();
    withModeTracking(progression("theorycraft")).setProfile({} as Progression["profile"]);
    withModeTracking(progression("progression")).setProfile({} as Progression["profile"]);
    expect(events.mock.calls).toEqual([["mode_changed", { mode: "progression" }]]);
  });

  it("sends nothing for a mode mirrored from another tab", () => {
    localStorage.clear();
    const events = sink();
    const { result } = renderHook(() => withModeTracking(useProgression()));
    expect(result.current.mode).toBe("theorycraft");
    // Another tab sets the mode: this tab sees the storage event and follows it.
    act(() => {
      localStorage.setItem("tg:builder-mode", "progression");
      window.dispatchEvent(new StorageEvent("storage", { key: "tg:builder-mode" }));
    });
    expect(result.current.mode).toBe("progression");
    expect(events).not.toHaveBeenCalled();
    // This tab's own switch back is counted.
    act(() => result.current.setMode("theorycraft"));
    expect(events.mock.calls).toEqual([["mode_changed", { mode: "theorycraft" }]]);
    localStorage.clear();
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
