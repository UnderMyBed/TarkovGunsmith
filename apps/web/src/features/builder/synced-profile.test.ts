// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_PROFILE, useProgression } from "@tarkov/data";
import { applySyncedProfile } from "./synced-profile.js";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

const IMPORTED = { ...DEFAULT_PROFILE, flea: true, level: 30, completedQuests: ["setup"] };

describe("applySyncedProfile", () => {
  it("applies a connect: advanced mode, and progression", () => {
    const { result } = renderHook(() => useProgression());
    expect(result.current.mode).toBe("theorycraft");

    act(() => applySyncedProfile(result.current, IMPORTED, "connect"));
    expect(result.current.mode).toBe("progression");
    expect(result.current.profile).toEqual({ ...IMPORTED, mode: "advanced" });
  });

  it("applies a re-sync with no profile set yet as the first import it is", () => {
    const { result } = renderHook(() => useProgression());
    act(() => applySyncedProfile(result.current, IMPORTED, "resync"));
    expect(result.current.mode).toBe("progression");
    expect(result.current.profile).toEqual({ ...IMPORTED, mode: "advanced" });
  });

  it("lets a re-sync that lands after a switch to theorycraft refresh the profile only", () => {
    const { result } = renderHook(() => useProgression());
    act(() => result.current.setProfile(DEFAULT_PROFILE));
    act(() => result.current.setMode("theorycraft"));

    act(() => applySyncedProfile(result.current, IMPORTED, "resync"));
    expect(result.current.mode).toBe("theorycraft");
    expect(result.current.profile).toEqual(IMPORTED);
  });
});
