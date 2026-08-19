// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

// `/builder/$id` (routes/builder.$id.tsx) reuses `BuilderPage` (routes/builder.tsx, the
// unit's priority surface — see builder.test.tsx) via `initialWeaponId`/`initialAttachments`/
// etc. props, hydrated from a build loaded through `useLoadBuild`. That hook hits the
// builds-api Worker via the GLOBAL `fetch` (same-origin `/api/builds/:id`), NOT through the
// TarkovJsonClient — so these tests stub `globalThis.fetch` rather than the test client.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const VALID_ID = "abcdefgh"; // 8 chars from the builds-api id alphabet.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("/builder/$id", () => {
  it("shows a loading skeleton while the build fetch is pending", async () => {
    // A never-resolving fetch keeps the query in flight so the skeleton stays visible.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    await renderRoute(`/builder/${VALID_ID}`);
    expect(await screen.findByRole("status", { busy: true })).toBeInTheDocument();
  });

  it("shows an invalid-id error without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderRoute("/builder/not-a-valid-id");
    expect(await screen.findByText("Invalid build id")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a not-found error on HTTP 404, with a link back to a fresh build", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await renderRoute(`/builder/${VALID_ID}`);
    expect(await screen.findByText("Build not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start a fresh build/ })).toHaveAttribute(
      "href",
      "/builder",
    );
  });

  it("shows an unreachable error when the network request itself fails, and Try again re-fetches", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    await renderRoute(`/builder/${VALID_ID}`);
    expect(await screen.findByText("Couldn't reach build storage")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await (
      await import("@testing-library/user-event")
    ).default
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("loads a v6 build: shows the load notice, hydrates the weapon + known attachment, and flags an unresolvable mod as upstream drift", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          version: 6,
          weaponId: "w-m4a1",
          // mod-muzzle resolves against the fixture weapon tree; "mod-vanished" does not —
          // it exercises `upstreamDrift`'s "N mods couldn't be resolved" path.
          attachments: { mod_muzzle: "mod-muzzle", mod_stock: "mod-vanished" },
          orphaned: [],
          createdAt: new Date().toISOString(),
        }),
      ),
    );
    await renderRoute(`/builder/${VALID_ID}`);

    expect(await screen.findByText(/Loaded build/)).toBeInTheDocument();
    expect(screen.getByText(VALID_ID)).toBeInTheDocument();

    // Weapon hydrated from `initialWeaponId` — BuildHeader shows its name once weapons.data
    // resolves, and the slot tree reports both attachments (mod-vanished still occupies its
    // slot path; only the *availability* lookup fails for it, not placement).
    expect(await screen.findByText("2 attached")).toBeInTheDocument();

    // upstreamDrift: 1 of the 2 attached mod ids isn't in the fixture mod list.
    expect(await screen.findByText(/1 mod couldn't be resolved/)).toBeInTheDocument();
    expect(screen.getByText(/Viewing what still exists\./)).toBeInTheDocument();
  });

  it("loads a v1 build and migrates its flat modIds into slot attachments once the tree resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          version: 1,
          weaponId: "w-m4a1",
          modIds: ["mod-muzzle"],
          createdAt: new Date().toISOString(),
        }),
      ),
    );
    await renderRoute(`/builder/${VALID_ID}`);

    expect(await screen.findByText(/Loaded build/)).toBeInTheDocument();
    // `migrateV1ToV2` walks the resolved slot tree and places "mod-muzzle" into the one slot
    // whose `allowedItemIds` contains it (`mod_muzzle`) — landing as a single v2 attachment.
    expect(await screen.findByText("1 attached")).toBeInTheDocument();
  });
});
