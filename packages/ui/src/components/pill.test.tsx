import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Pill } from "./pill.js";
import { classList, classSignature } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

const TONES = ["default", "reliable", "marginal", "ineffective", "accent", "muted"] as const;

function signatureFor(tone: (typeof TONES)[number]): string {
  render(<Pill tone={tone}>{tone}</Pill>);
  const sig = classSignature(screen.getByText(tone));
  cleanup();
  return sig;
}

describe("Pill", () => {
  it("renders its children inside a <span>", () => {
    render(<Pill>Reliable</Pill>);
    expect(screen.getByText("Reliable").tagName).toBe("SPAN");
  });

  it("defaults to the default tone", () => {
    render(<Pill>Implicit</Pill>);
    const implicit = classSignature(screen.getByText("Implicit"));
    cleanup();
    render(<Pill tone="default">Explicit</Pill>);
    expect(classSignature(screen.getByText("Explicit"))).toBe(implicit);
  });

  it.each(TONES.filter((t) => t !== "default"))(
    "tone=%s renders a class set of its own, distinct from the default tone",
    (tone) => {
      expect(signatureFor(tone)).not.toBe(signatureFor("default"));
    },
  );

  /* The four tones that carry a distinct meaning in the ammo-vs-armor readout must be
   * distinguishable from one another. `muted` and `accent` are presentational aliases —
   * `muted` currently renders exactly what `ineffective` does — so they are deliberately
   * outside this group rather than asserted against it. Which colour each tone resolves to
   * is a stylesheet fact, checked in apps/web/src/styles.test.ts. */
  it("gives each semantic matchup tone its own class set", () => {
    const semantic = ["default", "reliable", "marginal", "ineffective"] as const;
    const signatures = semantic.map(signatureFor);
    expect(new Set(signatures).size).toBe(semantic.length);
  });

  it("forwards a ref to the underlying <span>", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Pill ref={ref}>Ref</Pill>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it("merges a caller className on top of its own classes instead of replacing them", () => {
    render(<Pill>Base</Pill>);
    const base = classList(screen.getByText("Base"));
    cleanup();
    render(<Pill className="ml-2">Merged</Pill>);
    const el = screen.getByText("Merged");
    expect(el).toHaveClass("ml-2");
    expect(el).toHaveClass(...base);
  });
});
