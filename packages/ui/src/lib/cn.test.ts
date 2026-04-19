import { describe, expect, it } from "vitest";
import { cn } from "./cn.js";

describe("cn", () => {
  it("joins multiple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("dedupes conflicting Tailwind utilities, keeping the last one", () => {
    // tailwind-merge knows that p-2 and p-4 conflict; p-4 wins.
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditional classes via clsx", () => {
    // eslint-disable-next-line no-constant-binary-expression
    expect(cn("foo", false && "skip", "bar", null, undefined, { baz: true, qux: false })).toBe(
      "foo bar baz",
    );
  });

  it("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("preserves non-conflicting Tailwind utilities", () => {
    expect(cn("p-2", "m-4", "text-sm")).toBe("p-2 m-4 text-sm");
  });
});
