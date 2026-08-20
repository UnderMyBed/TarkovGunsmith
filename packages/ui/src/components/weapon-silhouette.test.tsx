import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeaponSilhouette, weaponSilhouetteSrc } from "./weapon-silhouette.js";
import { classList } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

describe("WeaponSilhouette", () => {
  it("renders an <img> pointed at the CDN base-image URL for the given itemId", () => {
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="M4A1" />);
    const img = screen.getByRole("img", { name: "M4A1" });
    expect(img).toHaveAttribute(
      "src",
      "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-base-image.webp",
    );
  });

  /* The monochrome filter and blend mode are class-driven, so whether they resolve to real
   * rules is a stylesheet fact — checked in apps/web/src/styles.test.ts, where under GitHub
   * issue #162 they did not. The reduced opacity is an inline style and is assertable here. */
  it("renders at reduced opacity so it reads as a backdrop, not content", () => {
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="mono" />);
    expect(screen.getByRole("img", { name: "mono" }).style.opacity).toBe("0.55");
  });

  it("hides itself on image load error so a broken CDN link doesn't break layout", () => {
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="errors" />);
    const img = screen.getByRole("img", { name: "errors" });
    expect(img.style.display).not.toBe("none");
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });

  it("defaults alt to empty string and loading to lazy", () => {
    const { container } = render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("merges a caller className on top of its own classes instead of replacing them", () => {
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="base" />);
    const base = classList(screen.getByRole("img", { name: "base" }));
    cleanup();
    render(
      <WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="cls" className="h-full w-full" />,
    );
    const img = screen.getByRole("img", { name: "cls" });
    expect(img).toHaveClass("h-full", "w-full");
    expect(img).toHaveClass(...base);
  });

  it("forwards a ref to the underlying <img>", () => {
    const ref = createRef<HTMLImageElement>();
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" ref={ref} alt="ref-check" />);
    expect(ref.current).toBeInstanceOf(HTMLImageElement);
  });
});

/* The pure-function tests below were previously a sibling `weapon-silhouette.test.ts`. They live here
 * now because TypeScript's `include` resolution drops the lower-priority extension when two
 * files share a basename — `weapon-silhouette.test.ts` silently shadowed `weapon-silhouette.test.tsx`, excluding
 * the render tests from the type-checked program entirely. Vitest resolved both, so they ran
 * and passed while never being typechecked. One file per component avoids the collision. */
describe("weaponSilhouetteSrc", () => {
  it("builds the base-image CDN URL from an item id", () => {
    expect(weaponSilhouetteSrc("5447a9cd4bdc2dbd208b4567")).toBe(
      "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-base-image.webp",
    );
  });

  it("throws on empty itemId", () => {
    expect(() => weaponSilhouetteSrc("")).toThrow();
  });
});
