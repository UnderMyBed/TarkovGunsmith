import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./input.js";

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

  it("merges caller className without dropping the base layout classes", () => {
    render(<Input className="w-40" aria-label="merged" />);
    const el = screen.getByLabelText("merged");
    expect(el.className).toContain("w-40");
    expect(el.className).toContain("rounded-[var(--radius)]");
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
});
