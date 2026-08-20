import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button.js";
import { classList, classSignature } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

const VARIANTS = ["default", "secondary", "ghost", "destructive"] as const;
const SIZES = ["sm", "md", "lg", "icon"] as const;

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

  /* Variant/size coverage asserts that the prop makes an observable difference, not which
   * token it selects — the tokens themselves are checked against the compiled stylesheet in
   * apps/web/src/styles.test.ts. A variant that silently stopped applying anything, or two
   * variants collapsing onto the same styling, fails here. */
  it("gives every variant its own class set", () => {
    const signatures = VARIANTS.map((variant) => {
      render(<Button variant={variant}>{variant}</Button>);
      const sig = classSignature(screen.getByRole("button", { name: variant }));
      cleanup();
      return sig;
    });
    expect(signatures.every((s) => s.length > 0)).toBe(true);
    expect(new Set(signatures).size).toBe(VARIANTS.length);
  });

  it("gives every size its own class set", () => {
    const signatures = SIZES.map((size) => {
      render(<Button size={size}>{size}</Button>);
      const sig = classSignature(screen.getByRole("button", { name: size }));
      cleanup();
      return sig;
    });
    expect(signatures.every((s) => s.length > 0)).toBe(true);
    expect(new Set(signatures).size).toBe(SIZES.length);
  });

  it("defaults to the same rendering as variant=default size=md", () => {
    render(<Button>Implicit</Button>);
    const implicit = classSignature(screen.getByRole("button", { name: "Implicit" }));
    cleanup();
    render(
      <Button variant="default" size="md">
        Explicit
      </Button>,
    );
    expect(classSignature(screen.getByRole("button", { name: "Explicit" }))).toBe(implicit);
  });

  it("merges a caller className on top of its own classes instead of replacing them", () => {
    render(<Button>Base</Button>);
    const base = classList(screen.getByRole("button", { name: "Base" }));
    cleanup();
    render(<Button className="mt-4">Merged</Button>);
    const el = screen.getByRole("button", { name: "Merged" });
    expect(el).toHaveClass("mt-4");
    expect(el).toHaveClass(...base);
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

  it("is reachable by keyboard and activates on Enter", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Keyboard</Button>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Keyboard" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
