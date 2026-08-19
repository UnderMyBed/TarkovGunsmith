import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TarkovIcon, iconUrl } from "./tarkov-icon.js";

afterEach(() => cleanup());

describe("TarkovIcon", () => {
  it("renders an <img> pointed at the CDN icon URL for the given itemId", () => {
    render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" alt="M4A1" />);
    const img = screen.getByRole("img", { name: "M4A1" });
    expect(img).toHaveAttribute(
      "src",
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp",
    );
  });

  it("uses an explicit variant to build the src", () => {
    render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" variant="grid-image" alt="grid" />);
    expect(screen.getByRole("img", { name: "grid" })).toHaveAttribute(
      "src",
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-grid-image.webp",
    );
  });

  it("defaults alt to an empty string (decorative image) when not provided", () => {
    const { container } = render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
  });

  it("defaults loading to lazy", () => {
    render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" alt="lazy-check" />);
    expect(screen.getByRole("img", { name: "lazy-check" })).toHaveAttribute("loading", "lazy");
  });

  it("respects an explicit loading override", () => {
    render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" alt="eager-check" loading="eager" />);
    expect(screen.getByRole("img", { name: "eager-check" })).toHaveAttribute("loading", "eager");
  });

  it("merges caller className with the base inline-block class", () => {
    render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" alt="cls" className="h-8 w-8" />);
    const img = screen.getByRole("img", { name: "cls" });
    expect(img.className).toContain("h-8 w-8");
    expect(img.className).toContain("inline-block");
  });

  it("forwards a ref to the underlying <img>", () => {
    const ref = createRef<HTMLImageElement>();
    render(<TarkovIcon itemId="5656d7c34bdc2d9d198b4587" ref={ref} alt="ref-check" />);
    expect(ref.current).toBeInstanceOf(HTMLImageElement);
  });
});

/* The pure-function tests below were previously a sibling `tarkov-icon.test.ts`. They live here
 * now because TypeScript's `include` resolution drops the lower-priority extension when two
 * files share a basename — `tarkov-icon.test.ts` silently shadowed `tarkov-icon.test.tsx`, excluding
 * the render tests from the type-checked program entirely. Vitest resolved both, so they ran
 * and passed while never being typechecked. One file per component avoids the collision. */
describe("iconUrl", () => {
  it("builds a CDN URL from an item id with default size", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp",
    );
  });

  it("supports the grid-image variant", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587", "grid-image")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-grid-image.webp",
    );
  });

  it("supports the base-image variant", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587", "base-image")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-base-image.webp",
    );
  });

  it("throws on empty itemId", () => {
    expect(() => iconUrl("")).toThrow(/itemId/);
  });
});
