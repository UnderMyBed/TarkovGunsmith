import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./input.js";
import { classList } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

describe("Input", () => {
  it("defaults to type=text", () => {
    render(<Input placeholder="search" />);
    expect(screen.getByPlaceholderText("search")).toHaveAttribute("type", "text");
  });

  it("respects an explicit type override", () => {
    render(<Input type="number" aria-label="qty" />);
    expect(screen.getByLabelText("qty")).toHaveAttribute("type", "number");
  });

  it("forwards a ref to the underlying <input>", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="ref-input" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("merges a non-conflicting caller className on top of its own classes", () => {
    render(<Input aria-label="base" />);
    const base = classList(screen.getByLabelText("base"));
    cleanup();
    render(<Input className="mt-4" aria-label="merged" />);
    const el = screen.getByLabelText("merged");
    expect(el).toHaveClass("mt-4");
    expect(el).toHaveClass(...base);
  });

  /* <Input> is full-width by default and every consumer that needs a narrower field passes
   * its own width (`/data`'s filter box is `w-56`). `cn`'s tailwind-merge pass has to let the
   * caller win outright rather than emit both widths and leave the outcome to source order. */
  it("lets a caller width replace its own rather than emitting both", () => {
    render(<Input className="w-40" aria-label="override" />);
    const widths = classList(screen.getByLabelText("override")).filter((c) => /^w-/.test(c));
    expect(widths).toEqual(["w-40"]);
  });

  it("accepts typed input and reports changes via onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input aria-label="typed" onChange={onChange} />);
    const el = screen.getByLabelText("typed");
    await user.type(el, "m4a1");
    expect(el).toHaveValue("m4a1");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("is disableable and blocks further typing", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="disabled-input" disabled defaultValue="" />);
    const el = screen.getByLabelText("disabled-input");
    expect(el).toBeDisabled();
    await user.type(el, "x");
    expect(el).toHaveValue("");
  });

  /* The focus RING itself is a stylesheet fact, checked in apps/web/src/styles.test.ts —
   * `focus-visible:outline-none` suppresses the browser's own focus indicator, so the ring
   * that replaces it has to actually reach the compiled CSS. What is assertable here is that
   * the control takes keyboard focus at all. */
  it("takes keyboard focus", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="focusable" />);
    await user.tab();
    expect(screen.getByLabelText("focusable")).toHaveFocus();
  });
});
