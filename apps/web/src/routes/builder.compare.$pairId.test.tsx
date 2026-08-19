// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * `/builder/compare/$pairId`'s file-based parent is `/builder/compare`
 * (`routes/builder.compare.tsx`, confirmed via `getParentRoute` in the generated
 * `route-tree.gen.ts`). In TanStack Router, every ancestor in a matched route chain must
 * render `<Outlet />` for a descendant's component to mount — `builder.compare.tsx` now
 * does that (mirroring `BuilderRouteLayout` in `builder.tsx`), so `LoadedComparePage` —
 * the component that owns `useLoadPair`, the loading skeleton, and every `LoadErrorCard`
 * branch — actually mounts for a `/builder/compare/$pairId` URL.
 *
 * `useLoadPair` hits the builds-api Worker via the GLOBAL `fetch` (same-origin
 * `/api/pairs/:id`), NOT through the TarkovJsonClient — see `packages/tarkov-data/src/
 * hooks/useLoadPair.ts` and `pairsApi.ts`. So these tests stub `globalThis.fetch` rather
 * than the test client, same pattern as `builder.$id.test.tsx`.
 */

const VALID_ID = "abcdefgh"; // 8 chars from the builds-api id alphabet (pairsApi.ts's regex).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const leftBuild = {
  version: 6 as const,
  weaponId: "w-m4a1",
  attachments: { mod_muzzle: "mod-muzzle" },
  orphaned: [],
  createdAt: new Date().toISOString(),
};

describe("/builder/compare/$pairId", () => {
  it("shows a loading skeleton while the pair fetch is pending, and never falls back to the blank draft", async () => {
    // A never-resolving fetch keeps the query in flight so the skeleton stays visible.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    await renderRoute(`/builder/compare/${VALID_ID}`);

    expect(await screen.findByRole("status", { busy: true })).toBeInTheDocument();
    // The blank-draft toolbar (`ComparePage`'s "Save comparison") must NOT render — that
    // was the bug: the parent swallowing the child and showing an empty draft instead.
    expect(screen.queryByRole("button", { name: "Save comparison" })).not.toBeInTheDocument();
  });

  it("shows an invalid-id error without ever calling fetch", async () => {
    // A segment that's URL-safe (unlike e.g. "???", which the URL parser would read as the
    // start of a query string rather than a path segment) but fails `PAIR_ID_REGEX` — wrong
    // alphabet and length, same shape as builder.$id.test.tsx's invalid-id case.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderRoute("/builder/compare/not-a-valid-id");
    expect(await screen.findByText("Invalid comparison id")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a not-found error on HTTP 404, with a link back to a fresh comparison", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await renderRoute(`/builder/compare/${VALID_ID}`);
    expect(await screen.findByText("Comparison not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a new comparison" })).toHaveAttribute(
      "href",
      "/builder/compare",
    );
  });

  it("shows an unreachable error when the network request itself fails, and Retry re-fetches", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    await renderRoute(`/builder/compare/${VALID_ID}`);
    expect(await screen.findByText("Couldn't reach comparison storage")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await (
      await import("@testing-library/user-event")
    ).default
      .setup()
      .click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("loads a saved pair and renders CompareWorkspace with it — the actual regression this fixes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          v: 1,
          createdAt: new Date().toISOString(),
          left: leftBuild,
          right: null,
        }),
      ),
    );
    await renderRoute(`/builder/compare/${VALID_ID}`);

    // `CompareToolbar` shows "Save changes" (not "Save comparison") once a pairId is
    // present, plus "Save as new" — this is the loaded-pair toolbar, not the blank draft's.
    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as new" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save comparison" })).not.toBeInTheDocument();

    // Side A hydrated from the loaded pair's `left` build (1 attachment); side B is the
    // pair's `right: null`.
    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("No build selected.")).toBeInTheDocument();
  });
});
