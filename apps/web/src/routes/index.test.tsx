// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

afterEach(() => cleanup());

describe("/ (landing page)", () => {
  it("renders the hero heading and the two primary CTA links", async () => {
    await renderRoute("/");

    expect(screen.getByText("KNOW THE NUMBERS.")).toBeInTheDocument();

    const openBuilder = screen.getByRole("link", { name: "Open the Builder ▸" });
    expect(openBuilder).toHaveAttribute("href", "/builder");

    const runSim = screen.getByRole("link", { name: "Run a simulation" });
    expect(runSim).toHaveAttribute("href", "/sim");
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

    // "Learn More" points at plain /builder with no search params.
    const learnMore = screen.getByRole("link", { name: "Learn More" });
    expect(learnMore).toHaveAttribute("href", "/builder");
  });

  it("renders all four 'what it does' feature cards", async () => {
    await renderRoute("/");

    expect(screen.getByText("BUILDER")).toBeInTheDocument();
    expect(screen.getByText("OPTIMIZER")).toBeInTheDocument();
    expect(screen.getByText("COMPARE")).toBeInTheDocument();
    expect(screen.getByText("SHARE")).toBeInTheDocument();
    expect(
      screen.getByText("Slot tree editor with availability gating and live recompute."),
    ).toBeInTheDocument();
  });
});
