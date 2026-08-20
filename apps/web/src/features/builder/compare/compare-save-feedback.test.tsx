// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/render-route.js";

/**
 * The save path on `/builder/compare`, driven through the REAL route tree, the real
 * `useSavePair` mutation and the real `pairsApi` client — only `globalThis.fetch` is
 * stubbed, the same seam `builder.compare.$pairId.test.tsx` uses. Two regressions live
 * here:
 *
 * 1. A failed save produced no toast, no message and no state change — `save.mutate` was
 *    called with an `onSuccess` and nothing else, and the toolbar had no `isPending` /
 *    `error` prop to render with. The button simply did nothing.
 * 2. Issue #163 — after a successful save the toolbar kept reading "Save comparison" even
 *    though the URL already carried the new pair id, offering a button that would POST a
 *    duplicate pair.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NEW_ID = "abcd2345";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** POST /api/pairs → `status`; GET /api/pairs/:id → an empty saved pair. */
function stubPairsFetch(post: () => Promise<Response>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    if (init?.method === "POST") return post();
    if (url.includes("/api/pairs/")) {
      return Promise.resolve(
        jsonResponse({ v: 1, createdAt: new Date().toISOString(), left: null, right: null }, 200),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function clickSave() {
  const button = await screen.findByRole("button", { name: "Save comparison" });
  await userEvent.setup().click(button);
  return button;
}

describe("compare save — failures are visible", () => {
  it("names the daily write limit on a 429 instead of doing nothing", async () => {
    stubPairsFetch(() => Promise.resolve(new Response("Rate limited", { status: 429 })));
    await renderRoute("/builder/compare");
    await clickSave();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/save limit reached for today/i);
    expect(alert).toHaveTextContent(/00:00 UTC/);
  });

  it("tells the user to shrink the comparison on a 413", async () => {
    stubPairsFetch(() => Promise.resolve(new Response("Payload too large", { status: 413 })));
    await renderRoute("/builder/compare");
    await clickSave();

    expect(await screen.findByRole("alert")).toHaveTextContent(/too big to store/i);
  });

  it("points at the connection when the request never reaches storage", async () => {
    stubPairsFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await renderRoute("/builder/compare");
    await clickSave();

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach comparison storage/i);
  });

  it("stays on the draft after a failed save — nothing is lost and no id is invented", async () => {
    stubPairsFetch(() => Promise.resolve(new Response("Bad request", { status: 400 })));
    const { router } = await renderRoute("/builder/compare");
    await clickSave();

    await screen.findByRole("alert");
    expect(router.state.location.pathname).toBe("/builder/compare");
    // Still the pairId-less toolbar: no "Save as new", and the label hasn't flipped.
    expect(screen.getByRole("button", { name: "Save comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as new" })).not.toBeInTheDocument();
  });

  it("disables the save button while the POST is in flight", async () => {
    // A never-settling POST holds the mutation pending so the disabled state is observable.
    stubPairsFetch(() => new Promise<Response>(() => {}));
    await renderRoute("/builder/compare");
    const button = await clickSave();

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent("Saving…");
  });
});

describe("compare save — issue #163", () => {
  it("flips the toolbar to Save changes as soon as the pair has an id", async () => {
    const fetchMock = stubPairsFetch(() =>
      Promise.resolve(jsonResponse({ id: NEW_ID, url: `/builder/compare/${NEW_ID}` }, 201)),
    );
    const { router } = await renderRoute("/builder/compare");
    await clickSave();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/builder/compare/${NEW_ID}`));

    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save comparison" })).not.toBeInTheDocument();
    // "Save as new" is the only way to branch off a stored pair, so it has to be reachable
    // the moment one exists.
    expect(screen.getByRole("button", { name: "Save as new" })).toBeInTheDocument();
  });
});
