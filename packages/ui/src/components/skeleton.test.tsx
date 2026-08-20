import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Skeleton } from "./skeleton.js";
import { classList, classSignature } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

describe("Skeleton", () => {
  it("renders a single block with the default 100% width and 1rem height", () => {
    render(<Skeleton data-testid="skel" />);
    const el = screen.getByTestId("skel");
    expect(el.style.width).toBe("100%");
    expect(el.style.height).toBe("1rem");
  });

  it("applies an explicit width and height", () => {
    render(<Skeleton data-testid="skel" width={240} height="2rem" />);
    const el = screen.getByTestId("skel");
    expect(el.style.width).toBe("240px");
    expect(el.style.height).toBe("2rem");
  });

  it("renders a single block (no row children) when rows is 1 or omitted", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelectorAll("div")).toHaveLength(1);
  });

  it("renders `rows` stacked children when rows > 1", () => {
    const { container } = render(<Skeleton rows={4} />);
    // 1 wrapper div + 4 row divs.
    expect(container.querySelectorAll("div")).toHaveLength(5);
  });

  it("applies the row height to every stacked row", () => {
    render(<Skeleton rows={3} height="12px" data-testid="wrapper" />);
    const rows = screen.getByTestId("wrapper").children;
    expect(rows).toHaveLength(3);
    Array.from(rows).forEach((row) => {
      expect((row as HTMLElement).style.height).toBe("12px");
    });
  });

  /* A skeleton that does not animate reads as broken content rather than pending content, so
   * the single-block and stacked-row shapes have to style their placeholders identically.
   * That the animation class resolves to a real rule is checked against the compiled
   * stylesheet in apps/web/src/styles.test.ts — under GitHub issue #162 it did not. */
  it("styles a stacked row exactly like a standalone block", () => {
    render(<Skeleton data-testid="single" />);
    const single = classSignature(screen.getByTestId("single"));
    cleanup();
    render(<Skeleton rows={2} data-testid="wrapper" />);
    const firstRow = screen.getByTestId("wrapper").children[0]!;
    expect(classSignature(firstRow)).toBe(single);
  });

  it("merges a caller className and forwards other div attributes", () => {
    render(<Skeleton data-testid="base" />);
    const base = classList(screen.getByTestId("base"));
    cleanup();
    render(<Skeleton data-testid="skel" className="mb-4" aria-label="loading" />);
    const el = screen.getByTestId("skel");
    expect(el).toHaveClass("mb-4");
    expect(el).toHaveClass(...base);
    expect(el).toHaveAttribute("aria-label", "loading");
  });

  it("lets a caller style override the defaulted width and height", () => {
    render(<Skeleton data-testid="skel" width="10rem" style={{ width: "50%" }} />);
    expect(screen.getByTestId("skel").style.width).toBe("50%");
  });
});
