import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button.js";

afterEach(() => cleanup());

describe("Button", () => {
  it("renders its children as a native button element", () => {
    render(<Button>Fire</Button>);
    const el = screen.getByRole("button", { name: "Fire" });
    expect(el.tagName).toBe("BUTTON");
  });

  it("defaults to type=button so it never submits a surrounding form", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("respects an explicit type override", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("type", "submit");
  });

  it("applies the default variant/size classes when none are given", () => {
    render(<Button>Default</Button>);
    const el = screen.getByRole("button", { name: "Default" });
    // default variant → primary background token; default size → h-9.
    expect(el.className).toContain("bg-[var(--color-primary)]");
    expect(el.className).toContain("h-9");
  });

  it("swaps in the destructive variant classes and drops the default ones", () => {
    render(<Button variant="destructive">Delete</Button>);
    const el = screen.getByRole("button", { name: "Delete" });
    expect(el.className).toContain("bg-[var(--color-destructive)]");
    expect(el.className).not.toContain("bg-[var(--color-primary)]");
  });

  it("applies the icon size classes", () => {
    render(<Button size="icon">X</Button>);
    expect(screen.getByRole("button", { name: "X" }).className).toContain("h-9 w-9 p-0");
  });

  it("merges a caller className without losing variant classes (cn dedupe)", () => {
    render(<Button className="mt-4">Merged</Button>);
    const el = screen.getByRole("button", { name: "Merged" });
    expect(el.className).toContain("mt-4");
    expect(el.className).toContain("bg-[var(--color-primary)]");
  });

  it("forwards a ref to the underlying <button>", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("Ref");
  });

  it("disables the element and blocks clicks when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const el = screen.getByRole("button", { name: "Disabled" });
    expect(el).toBeDisabled();
    await user.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when enabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
