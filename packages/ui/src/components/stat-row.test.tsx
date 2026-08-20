import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatRow } from "./stat-row.js";
import { classSignature } from "../__test-utils__/class-set.js";

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

  /* An improvement, a regression and a neutral delta have to be told apart at a glance, so
   * each direction must style its cell differently. Which colour token each one picks is a
   * stylesheet fact — checked, along with the five-column grid template that holds the row
   * together, in apps/web/src/styles.test.ts. */
  it("styles up, down and neutral deltas differently from one another", () => {
    const signatures = (["up", "down", "neutral"] as const).map((direction) => {
      render(<StatRow label="Ergo" delta={direction} deltaDirection={direction} value={1} />);
      const sig = classSignature(screen.getByText(direction));
      cleanup();
      return sig;
    });
    expect(new Set(signatures).size).toBe(3);
  });

  it("treats an omitted deltaDirection as neutral", () => {
    render(<StatRow label="Ergo" delta="implicit" value={1} />);
    const implicit = classSignature(screen.getByText("implicit"));
    cleanup();
    render(<StatRow label="Ergo" delta="explicit" deltaDirection="neutral" value={1} />);
    expect(classSignature(screen.getByText("explicit"))).toBe(implicit);
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

  it("gives every barTone its own class set on the fill", () => {
    const tones = ["primary", "olive", "destructive"] as const;
    const signatures = tones.map((barTone) => {
      const { container } = render(
        <StatRow label="Tone" value={1} percent={50} barTone={barTone} />,
      );
      const sig = classSignature(container.querySelector('[style*="width"]')!);
      cleanup();
      return sig;
    });
    expect(new Set(signatures).size).toBe(tones.length);
  });

  it("treats an omitted barTone as primary", () => {
    const { container: implicit } = render(<StatRow label="Implicit" value={1} percent={50} />);
    const implicitSig = classSignature(implicit.querySelector('[style*="width"]')!);
    cleanup();
    const { container: explicit } = render(
      <StatRow label="Explicit" value={1} percent={50} barTone="primary" />,
    );
    expect(classSignature(explicit.querySelector('[style*="width"]')!)).toBe(implicitSig);
  });

  it("merges a caller className onto the row wrapper", () => {
    const { container } = render(<StatRow label="Styled" value={1} className="extra-class" />);
    expect(container.firstElementChild).toHaveClass("extra-class");
  });
});
