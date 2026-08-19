import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Stamp } from "./stamp.js";

afterEach(() => cleanup());

describe("Stamp", () => {
  it("renders its children inside a <span>", () => {
    render(<Stamp>NERFED</Stamp>);
    expect(screen.getByText("NERFED").tagName).toBe("SPAN");
  });

  it("defaults to the amber tone", () => {
    render(<Stamp>Amber</Stamp>);
    expect(screen.getByText("Amber").className).toContain("text-[var(--color-primary)]");
  });

  it("applies the red tone's destructive color class", () => {
    render(<Stamp tone="red">Red</Stamp>);
    expect(screen.getByText("Red").className).toContain("text-[var(--color-destructive)]");
  });

  it("applies the paper tone's foreground color class", () => {
    render(<Stamp tone="paper">Paper</Stamp>);
    expect(screen.getByText("Paper").className).toContain("text-[var(--color-foreground)]");
  });

  it("forwards a ref to the underlying <span>", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Stamp ref={ref}>Ref</Stamp>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it("merges caller className with the variant classes", () => {
    render(<Stamp className="ml-1">Merged</Stamp>);
    expect(screen.getByText("Merged").className).toContain("ml-1");
  });
});
