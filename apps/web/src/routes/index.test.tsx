// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

afterEach(() => cleanup());

describe("/ (landing page)", () => {
  it("renders the hero heading and the primary CTA and no simulator link", async () => {
    await renderRoute("/");

    expect(screen.getByText("Know the numbers.")).toBeInTheDocument();

    const openBuilder = screen.getByRole("link", { name: "Open the Builder ▸" });
    expect(openBuilder).toHaveAttribute("href", "/builder");

    expect(screen.queryByRole("link", { name: "Run a simulation" })).toBeNull();
    expect(document.querySelector('a[href="/sim"]')).toBeNull();
  });

  it("resolves the compare and optimizer-promo links to their target routes", async () => {
    await renderRoute("/");

    const compareLink = screen.getByRole("link", { name: /or compare two builds/ });
    expect(compareLink).toHaveAttribute("href", "/builder/compare");

    // TanStack Router encodes `search: { view: "optimize" }` into the resolved href's query
    // string.
    const tryOptimizer = screen.getByRole("link", { name: "Try Optimizer" });
    expect(tryOptimizer.getAttribute("href")).toContain("/builder");
    expect(tryOptimizer.getAttribute("href")).toContain("view=optimize");

    // "Learn more" points at plain /builder with no search params.
    const learnMore = screen.getByRole("link", { name: "Learn more" });
    expect(learnMore).toHaveAttribute("href", "/builder");
  });

  it("renders all four 'what it does' feature cards", async () => {
    await renderRoute("/");
    const features = screen.getByRole("region", { name: "What TarkovGunsmith does" });

    expect(within(features).getByText("Builder")).toBeInTheDocument();
    expect(within(features).getByText("Optimizer")).toBeInTheDocument();
    expect(within(features).getByText("Compare")).toBeInTheDocument();
    expect(within(features).getByText("Share")).toBeInTheDocument();
    expect(
      screen.getByText("Slot tree editor with availability gating and live recompute."),
    ).toBeInTheDocument();
  });
});
