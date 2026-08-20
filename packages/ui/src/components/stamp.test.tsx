import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Stamp } from "./stamp.js";
import { classList, classSignature } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

const TONES = ["amber", "red", "paper"] as const;

describe("Stamp", () => {
  it("renders its children inside a <span>", () => {
    render(<Stamp>NERFED</Stamp>);
    expect(screen.getByText("NERFED").tagName).toBe("SPAN");
  });

  /* Which token each tone picks is checked against the compiled stylesheet in
   * apps/web/src/styles.test.ts (along with the rotation and hairline border that make a
   * Stamp look stamped at all). Here: the prop has to change something. */
  it("gives every tone its own class set", () => {
    const signatures = TONES.map((tone) => {
      render(<Stamp tone={tone}>{tone}</Stamp>);
      const sig = classSignature(screen.getByText(tone));
      cleanup();
      return sig;
    });
    expect(signatures.every((s) => s.length > 0)).toBe(true);
    expect(new Set(signatures).size).toBe(TONES.length);
  });

  it("defaults to the amber tone", () => {
    render(<Stamp>Implicit</Stamp>);
    const implicit = classSignature(screen.getByText("Implicit"));
    cleanup();
    render(<Stamp tone="amber">Explicit</Stamp>);
    expect(classSignature(screen.getByText("Explicit"))).toBe(implicit);
  });

  it("forwards a ref to the underlying <span>", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Stamp ref={ref}>Ref</Stamp>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it("merges a caller className on top of its own classes instead of replacing them", () => {
    render(<Stamp>Base</Stamp>);
    const base = classList(screen.getByText("Base"));
    cleanup();
    render(<Stamp className="ml-1">Merged</Stamp>);
    const el = screen.getByText("Merged");
    expect(el).toHaveClass("ml-1");
    expect(el).toHaveClass(...base);
  });

  it("passes through arbitrary span attributes", () => {
    render(<Stamp title="stamped">Attrs</Stamp>);
    expect(screen.getByText("Attrs")).toHaveAttribute("title", "stamped");
  });
});
