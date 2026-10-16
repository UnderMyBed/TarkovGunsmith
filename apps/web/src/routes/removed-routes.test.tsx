// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

afterEach(() => cleanup());

/** Features parked while the site is Builder-only (#210). Their old URLs must land on /builder. */
const PARKED = ["/calc", "/sim", "/adc", "/aec", "/matrix", "/data", "/charts", "/smoke"] as const;

describe("parked feature routes redirect to /builder", () => {
  it.each(PARKED)("%s -> /builder", async (path) => {
    const { router } = await renderRoute(path);

    expect(router.state.location.pathname).toBe("/builder");
    expect(await screen.findByText("NO WEAPON SELECTED")).toBeInTheDocument();
  });
});
