import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatRow } from "./stat-row.js";

afterEach(() => cleanup());

describe("StatRow", () => {
  it("renders label, stock, delta and value text", () => {
    render(<StatRow label="Recoil V" stock={119} delta="−50%" value={60.095} percent={50} />);
    // The `uppercase` class is a CSS text-transform, not a DOM text mutation —
    // the rendered text node stays exactly as the `label` prop was passed.
    expect(screen.getByText("Recoil V")).toBeInTheDocument();
    expect(screen.getByText("119")).toBeInTheDocument();
    expect(screen.getByText("−50%")).toBeInTheDocument();
    expect(screen.getByText("60.095")).toBeInTheDocument();
  });

  it("renders blank stock/delta cells when omitted rather than the literal word 'undefined'", () => {
    const { container } = render(<StatRow label="Ergonomics" value={48} />);
    // The stock and delta cells fall back to "" — assert no stray "undefined" text leaks in.
    expect(container.textContent).not.toContain("undefined");
  });

  it("colors an 'up' delta with the olive (improvement) token", () => {
    render(<StatRow label="Ergo" delta="+18" deltaDirection="up" value={66} />);
    const deltaEl = screen.getByText("+18");
    expect(deltaEl.className).toContain("text-[var(--color-olive)]");
  });

  it("colors a 'down' delta with the destructive (regression) token", () => {
    render(<StatRow label="Ergo" delta="-9" deltaDirection="down" value={39} />);
    expect(screen.getByText("-9").className).toContain("text-[var(--color-destructive)]");
  });

  it("colors a neutral (default) delta with the muted-foreground token", () => {
    render(<StatRow label="Ergo" delta="0" value={48} />);
    expect(screen.getByText("0").className).toContain("text-[var(--color-muted-foreground)]");
  });

  it("omits the bar fill entirely when percent is not provided", () => {
    const { container } = render(<StatRow label="No bar" value={1} />);
    expect(container.querySelector('[style*="width"]')).not.toBeInTheDocument();
  });

  it("renders a bar fill sized to the given percent", () => {
    const { container } = render(<StatRow label="Bar" value={1} percent={73} />);
    const bar = container.querySelector<HTMLElement>('[style*="width"]');
    expect(bar).not.toBeNull();
    expect(bar?.style.width).toBe("73%");
  });

  it("clamps an out-of-range percent to [0, 100]", () => {
    const { container: over } = render(<StatRow label="Over" value={1} percent={140} />);
    expect((over.querySelector('[style*="width"]') as HTMLElement).style.width).toBe("100%");

    const { container: under } = render(<StatRow label="Under" value={1} percent={-30} />);
    expect((under.querySelector('[style*="width"]') as HTMLElement).style.width).toBe("0%");
  });

  it.each([
    ["olive", "bg-[var(--color-olive)]"],
    ["destructive", "bg-[var(--color-destructive)]"],
    ["primary", "bg-[var(--color-primary)]"],
  ] as const)("uses the %s barTone's background class on the fill", (barTone, expectedClass) => {
    const { container } = render(<StatRow label="Tone" value={1} percent={50} barTone={barTone} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar?.className).toContain(expectedClass);
  });
});
