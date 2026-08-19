import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Skeleton } from "./skeleton.js";

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

  it("merges caller className and forwards other div attributes", () => {
    render(<Skeleton data-testid="skel" className="mb-4" aria-label="loading" />);
    const el = screen.getByTestId("skel");
    expect(el.className).toContain("mb-4");
    expect(el).toHaveAttribute("aria-label", "loading");
  });
});
