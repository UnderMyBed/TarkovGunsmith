import { describe, it, expect } from "vitest";
import { cardVariants } from "./card.js";

describe("Card bracket-olive variant", () => {
  it("applies the olive border class when variant='bracket-olive'", () => {
    const cls = cardVariants({ variant: "bracket-olive" });
    // The bracket-olive variant uses var(--color-olive) for border color.
    expect(cls).toContain("before:border-[var(--color-olive)]");
    expect(cls).toContain("after:border-[var(--color-olive)]");
  });

  it("applies the primary border class when variant='bracket'", () => {
    const cls = cardVariants({ variant: "bracket" });
    expect(cls).toContain("before:border-[var(--color-primary)]");
    expect(cls).toContain("after:border-[var(--color-primary)]");
  });

  it("applies no bracket classes for default (plain) variant", () => {
    const cls = cardVariants({ variant: "plain" });
    expect(cls).not.toContain("before:");
    expect(cls).not.toContain("after:");
  });
});
