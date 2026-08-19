// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { RouteErrorFallback } from "./route-error-fallback.js";

afterEach(() => cleanup());

/**
 * `RouteErrorFallback` renders a `<Link>`, which throws outside a router context
 * ("Cannot read properties of null (reading 'isServer')" — `useLinkProps` dereferences the
 * router from context unconditionally). So every case here mounts it as a real root route's
 * component rather than calling `render()` on the bare component — the same shape
 * `router-options.test.tsx` uses to prove the `defaultErrorComponent` wiring, just without a
 * throw involved.
 */
function renderFallback(props: ErrorComponentProps) {
  const rootRoute = createRootRoute({ component: () => <RouteErrorFallback {...props} /> });
  const router = createRouter({ routeTree: rootRoute });
  return router.load().then(() => render(<RouterProvider router={router} />));
}

describe("RouteErrorFallback", () => {
  it("renders a curated message, never the raw error text", async () => {
    const error = new Error("TypeError: Cannot read properties of undefined");
    await renderFallback({ error, reset: () => {} });

    expect(await screen.findByText("This page failed to render")).toBeInTheDocument();
    expect(
      screen.getByText("Something in this view threw an unexpected error."),
    ).toBeInTheDocument();
    // The raw JS error message is machinery narration, not curated copy — must not leak.
    expect(screen.queryByText(/Cannot read properties of undefined/)).not.toBeInTheDocument();
  });

  it("calls reset when 'Try again' is clicked", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    await renderFallback({ error: new Error("boom"), reset });

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("'Back to home' links to /", async () => {
    await renderFallback({ error: new Error("boom"), reset: () => {} });

    expect(await screen.findByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
