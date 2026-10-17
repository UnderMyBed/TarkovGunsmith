// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSlotSheetOpen } from "./slot-sheet.js";

afterEach(() => cleanup());

function sheet(initial: { allowed: boolean; weaponId: string }) {
  return renderHook(
    (props: { allowed: boolean; weaponId: string }) =>
      useSlotSheetOpen(props.allowed, props.weaponId),
    { initialProps: initial },
  );
}

describe("useSlotSheetOpen", () => {
  it("opens and closes on request", () => {
    const { result } = sheet({ allowed: true, weaponId: "m4" });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("closes for good when the page leaves the editor, even once it comes back", () => {
    const { result, rerender } = sheet({ allowed: true, weaponId: "m4" });
    act(() => result.current[1](true));
    // Back/forward to ?view=optimize, then forward again to the editor.
    rerender({ allowed: false, weaponId: "m4" });
    expect(result.current[0]).toBe(false);
    rerender({ allowed: true, weaponId: "m4" });
    expect(result.current[0]).toBe(false);
  });

  it("closes for good when the weapon changes, even back to the first one", () => {
    const { result, rerender } = sheet({ allowed: true, weaponId: "m4" });
    act(() => result.current[1](true));
    rerender({ allowed: true, weaponId: "ak" });
    expect(result.current[0]).toBe(false);
    rerender({ allowed: true, weaponId: "m4" });
    expect(result.current[0]).toBe(false);
  });

  it("cannot open while not allowed", () => {
    const { result } = sheet({ allowed: false, weaponId: "m4" });
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(false);
  });
});
