// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { routerOptions } from "./router-options.js";

afterEach(() => cleanup());

/**
 * Before `routerOptions` existed, no route in apps/web set `errorComponent`, so TanStack Router's `Match`
 * component resolved `ResolvedCatchBoundary` to a no-op `SafeFragment` for every route — a
 * render throw had nothing to catch it and unmounted the whole tree (a blank page).
 *
 * This builds a throwaway two-route tree (independent of the real `route-tree.gen.ts`, so
 * it stays correct regardless of what routes the app ships) and proves `routerOptions`
 * — the exact object `router.ts` and `test/render-route.tsx` both spread into
 * `createRouter()` — actually installs the boundary: a route that throws on render shows
 * the fallback panel, not a blank document, and the app shell around it (here, the root's
 * `<Outlet />`) keeps rendering.
 */
function Boom(): never {
  throw new Error("kaboom");
}

describe("routerOptions.defaultErrorComponent wiring", () => {
  it("catches a render throw in a leaf route and shows the recovery panel", async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <span>shell-stays-mounted</span>
          <Outlet />
        </div>
      ),
    });
    const boomRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/boom",
      component: Boom,
    });
    const routeTree = rootRoute.addChildren([boomRoute]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/boom"] }),
      ...routerOptions,
    });
    await router.load();

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("This page failed to render")).toBeInTheDocument();
    // The boundary is per-match: the root's own content (outside the failed match) survives.
    expect(screen.getByText("shell-stays-mounted")).toBeInTheDocument();
  });

  it("does not affect a route that renders successfully", async () => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const okRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/ok",
      component: () => <span>all good</span>,
    });
    const routeTree = rootRoute.addChildren([okRoute]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/ok"] }),
      ...routerOptions,
    });
    await router.load();

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("all good")).toBeInTheDocument();
    expect(screen.queryByText("This page failed to render")).not.toBeInTheDocument();
  });
});
