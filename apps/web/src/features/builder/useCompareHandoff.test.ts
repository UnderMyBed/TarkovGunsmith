// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { DEFAULT_PROFILE, type BuildV6, type PlayerProfile } from "@tarkov/data";
import { HANDOFF_KEYS, useCompareHandoff } from "./useCompareHandoff.js";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  navigate.mockReset();
});

const build: BuildV6 = {
  version: 6,
  weaponId: "w",
  attachments: {},
  orphaned: [],
  createdAt: "2026-10-16T00:00:00.000Z",
};
const LL2: PlayerProfile = { ...DEFAULT_PROFILE, flea: true, level: 20 };

describe("useCompareHandoff", () => {
  it("hands Compare the Builder's profile in progression", () => {
    const { result } = renderHook(() => useCompareHandoff({ build, gate: LL2 }));
    act(() => result.current.confirm({ mode: "clone-both" }));
    expect(JSON.parse(sessionStorage.getItem(HANDOFF_KEYS.profile)!)).toEqual(LL2);
    expect(sessionStorage.getItem(HANDOFF_KEYS.mode)).toBe("clone-both");
    expect(navigate).toHaveBeenCalledWith({ to: "/builder/compare" });
  });

  it("hands over no profile in theorycraft, clearing one left by an earlier handoff", () => {
    sessionStorage.setItem(HANDOFF_KEYS.profile, JSON.stringify(LL2));
    const { result } = renderHook(() => useCompareHandoff({ build, gate: null }));
    act(() => result.current.confirm({ mode: "empty-right" }));
    expect(sessionStorage.getItem(HANDOFF_KEYS.profile)).toBeNull();
    expect(sessionStorage.getItem(HANDOFF_KEYS.left)).not.toBeNull();
  });
});
