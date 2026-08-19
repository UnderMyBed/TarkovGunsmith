import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SectionTitle } from "./section-title.js";

afterEach(() => cleanup());

describe("SectionTitle", () => {
  it("pads a single-digit numeric index to two digits", () => {
    render(<SectionTitle index={3} title="Attachments" />);
    expect(screen.getByText("03 · Attachments")).toBeInTheDocument();
  });

  it("leaves a two-digit index unpadded", () => {
    render(<SectionTitle index={12} title="Ammo" />);
    expect(screen.getByText("12 · Ammo")).toBeInTheDocument();
  });

  it("accepts a pre-formatted string index as-is (only pads when short)", () => {
    render(<SectionTitle index="A" title="Custom" />);
    expect(screen.getByText("0A · Custom")).toBeInTheDocument();
  });

  it("omits the meta label entirely when meta is not provided", () => {
    const { container } = render(<SectionTitle index={1} title="No meta" />);
    // Only the index/title span and the rule span should exist — no third span.
    expect(container.querySelectorAll("span")).toHaveLength(2);
  });

  it("renders the meta label when provided", () => {
    render(<SectionTitle index={1} title="With meta" meta="12 items" />);
    expect(screen.getByText("12 items")).toBeInTheDocument();
  });

  it("merges caller className onto the wrapping div", () => {
    const { container } = render(<SectionTitle index={1} title="Styled" className="extra-class" />);
    expect(container.firstElementChild?.className).toContain("extra-class");
  });
});
