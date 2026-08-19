// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * REAL BUG, found while writing this test (reported upstream, not fixed here — this unit's
 * brief is route characterization, not route repair, and "any route" is off-limits for a
 * fix per the brief's no-refactor constraint):
 *
 * `/builder/compare/$pairId`'s file-based parent is `/builder/compare`
 * (`routes/builder.compare.tsx`, confirmed via `getParentRoute` in the generated
 * `route-tree.gen.ts`). That parent's component is:
 *
 *   function ComparePage() { return <CompareWorkspace />; }
 *
 * — it does not render `<Outlet />`. In TanStack Router (same model as React Router's
 * nested routes), every ancestor in a matched route chain must render `<Outlet />` for a
 * descendant's component to mount at all. Without it, `LoadedComparePage` — the component
 * that owns `useLoadPair`, the loading skeleton, and every `LoadErrorCard` branch — is
 * DEAD CODE: it is never invoked, under any URL, in production or in tests.
 *
 * Verified with a router-state diagnostic before writing this file: navigating to
 * `/builder/compare/<anything>` produces `router.state.matches` of
 * `["__root__", "/builder", "/builder/compare", "/builder/compare/$pairId"]` — the route
 * DOES match all the way down — but the rendered tree stops at `/builder/compare`'s own
 * component. `useLoadPair`'s `fetch` call is never made (see the test below), for ANY
 * pairId, valid or malformed, existing or not. `apps/web/src/routes/builder.$id.tsx` does
 * NOT have this bug — its parent (`BuilderRouteLayout` in `builder.tsx`) explicitly renders
 * `<Outlet />` for exactly this reason.
 *
 * Practical impact: saving a comparison (`CompareWorkspace`'s handleSave) navigates to
 * `/builder/compare/$pairId` on success — that redirect currently lands on a BLANK new
 * comparison draft, not the just-saved one. Sharing a comparison URL has the same failure.
 *
 * Because the real component never mounts, its loading/error/success branches are not
 * reachable through routing and are not exercised below — testing them would require
 * bypassing the router in a way that no longer reflects real behaviour. What IS tested is
 * the actual (buggy) current behaviour: the route silently falls back to the blank
 * workspace, and no network request happens.
 */
describe("/builder/compare/$pairId", () => {
  it("renders the blank compare workspace instead of loading the pair (parent route has no <Outlet/>)", async () => {
    const fetchMock = vi.fn(
      () =>
        new Response(
          JSON.stringify({ v: 1, createdAt: new Date().toISOString(), left: null, right: null }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderRoute("/builder/compare/abcdefgh");

    // This is `ComparePage`'s ("/builder/compare") toolbar for a pairId-less draft, not
    // `LoadedComparePage`'s loading skeleton or the loaded pair's "Save changes"/"Save as
    // new" buttons — see the bug note above.
    expect(await screen.findByRole("button", { name: "Save comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // The pair-load network call never happens, because `LoadedComparePage` (which owns
    // `useLoadPair`) never mounts.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does the same for a malformed pairId — the route never gets far enough to validate it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderRoute("/builder/compare/???");

    expect(await screen.findByRole("button", { name: "Save comparison" })).toBeInTheDocument();
    expect(screen.queryByText("Invalid comparison id")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
