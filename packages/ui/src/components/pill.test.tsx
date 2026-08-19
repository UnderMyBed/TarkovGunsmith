import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Pill } from "./pill.js";

afterEach(() => cleanup());

describe("Pill", () => {
  it("renders its children inside a <span>", () => {
    render(<Pill>Reliable</Pill>);
    const el = screen.getByText("Reliable");
    expect(el.tagName).toBe("SPAN");
  });

  it("applies the default tone classes when no tone is given", () => {
    render(<Pill>Default</Pill>);
    expect(screen.getByText("Default").className).toContain("border-[var(--color-border)]");
  });

  it.each([
    ["reliable", "text-[var(--color-olive)]"],
    ["marginal", "text-[var(--color-primary)]"],
    ["ineffective", "text-[var(--color-paper-dim)]"],
    ["accent", "text-[var(--color-primary)]"],
    ["muted", "text-[var(--color-paper-dim)]"],
  ] as const)("applies the %s tone's text color class", (tone, expectedClass) => {
    render(<Pill tone={tone}>{tone}</Pill>);
    expect(screen.getByText(tone).className).toContain(expectedClass);
  });

  it("forwards a ref to the underlying <span>", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Pill ref={ref}>Ref</Pill>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it("merges caller className with the variant classes", () => {
    render(<Pill className="ml-2">Merged</Pill>);
    expect(screen.getByText("Merged").className).toContain("ml-2");
  });
});
