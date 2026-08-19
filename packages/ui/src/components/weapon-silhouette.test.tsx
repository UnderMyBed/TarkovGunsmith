import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeaponSilhouette } from "./weapon-silhouette.js";

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

  it("applies the monochrome filter and reduced opacity by default", () => {
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="mono" />);
    const img = screen.getByRole("img", { name: "mono" });
    expect(img.className).toContain("grayscale(1)");
    expect(img.style.opacity).toBe("0.55");
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

  it("merges caller className with the base classes", () => {
    render(
      <WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" alt="cls" className="h-full w-full" />,
    );
    const img = screen.getByRole("img", { name: "cls" });
    expect(img.className).toContain("h-full w-full");
    expect(img.className).toContain("mix-blend-multiply");
  });

  it("forwards a ref to the underlying <img>", () => {
    const ref = createRef<HTMLImageElement>();
    render(<WeaponSilhouette itemId="5447a9cd4bdc2dbd208b4567" ref={ref} alt="ref-check" />);
    expect(ref.current).toBeInstanceOf(HTMLImageElement);
  });
});
