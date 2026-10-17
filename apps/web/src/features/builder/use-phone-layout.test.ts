// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { PHONE_QUERY, usePhoneLayout } from "./use-phone-layout.js";
import { stubMatchMedia } from "../../test/match-media.js";

afterEach(() => cleanup());

describe("usePhoneLayout", () => {
  it("is false where there is no matchMedia, as in jsdom", () => {
    expect(typeof window.matchMedia).toBe("undefined");
    expect(renderHook(() => usePhoneLayout()).result.current).toBe(false);
  });

  it("reads the phone query on the first render", () => {
    const media = stubMatchMedia(true);
    try {
      expect(renderHook(() => usePhoneLayout()).result.current).toBe(true);
      expect(media.queries).toContain(PHONE_QUERY);
    } finally {
      media.restore();
    }
  });

  it("follows the query as the window crosses the breakpoint", () => {
    const media = stubMatchMedia(false);
    try {
      const { result } = renderHook(() => usePhoneLayout());
      expect(result.current).toBe(false);
      act(() => media.set(true));
      expect(result.current).toBe(true);
      act(() => media.set(false));
      expect(result.current).toBe(false);
    } finally {
      media.restore();
    }
  });
});
