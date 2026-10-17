// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";
import { DRAFT_KEY, sharedDraftKey } from "../features/builder/build-draft.js";

// `/builder/$id` (routes/builder.$id.tsx) reuses `BuilderPage` (routes/builder.tsx, the
// unit's priority surface — see builder.test.tsx) via `initialWeaponId`/`initialAttachments`/
// etc. props, hydrated from a build loaded through `useLoadBuild`. That hook hits the
// builds-api Worker via the GLOBAL `fetch` (same-origin `/api/builds/:id`), NOT through the
// TarkovJsonClient — so these tests stub `globalThis.fetch` rather than the test client.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const VALID_ID = "abcdefgh"; // 8 chars from the builds-api id alphabet.

/**
 * A loaded build is the author's, never a preset: once the weapon's presets have loaded, the
 * build still holds exactly its saved parts, so no preset chip is current.
 */
async function expectNotSeeded(savedCount: number): Promise<void> {
  const group = await screen.findByRole("group", { name: "Presets" });
  expect(screen.getByText(`${savedCount} attached`, { exact: true })).toBeInTheDocument();
  const pressed = within(group)
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true");
  expect(pressed).toEqual([]);
}

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
    expect(screen.getByRole("link", { name: /Open the builder/ })).toHaveAttribute(
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

  it("loads a v6 build: shows the load notice, hydrates the weapon + known attachment, and orphans an id the game data no longer holds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          version: 6,
          weaponId: "w-m4a1",
          // mod-muzzle resolves against the fixture weapon tree; "mod-vanished" is in no
          // snapshot, so it is moved off the weapon into the orphaned list on load.
          attachments: { mod_muzzle: "mod-muzzle", mod_stock: "mod-vanished" },
          orphaned: [],
          createdAt: new Date().toISOString(),
        }),
      ),
    );
    await renderRoute(`/builder/${VALID_ID}`);

    expect(await screen.findByText(/Loaded build/)).toBeInTheDocument();
    expect(screen.getByText(VALID_ID)).toBeInTheDocument();

    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(
      await screen.findByText(/1 mod from the saved build couldn't be placed on this weapon\./),
    ).toBeInTheDocument();
    expect(screen.getByText("mod-vanished — not a part the Builder knows")).toBeInTheDocument();
    await expectNotSeeded(1);
  });

  it("orphans a saved part whose slot path the build does not have, instead of hiding it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          version: 6,
          weaponId: "w-m4a1",
          // No part fitted at mod_muzzle has a mod_stock slot: the stock is on no slot here.
          attachments: { mod_muzzle: "mod-muzzle", "mod_muzzle/mod_stock": "mod-stock" },
          orphaned: [],
          createdAt: new Date().toISOString(),
        }),
      ),
    );
    await renderRoute(`/builder/${VALID_ID}`);

    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(
      await screen.findByText(/1 mod from the saved build couldn't be placed on this weapon\./),
    ).toBeInTheDocument();
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
    await expectNotSeeded(1);
  });
});

describe("/builder/$id edits", () => {
  const SHARED = {
    version: 6,
    weaponId: "w-m4a1",
    attachments: { mod_muzzle: "mod-muzzle" },
    orphaned: [],
    createdAt: new Date().toISOString(),
    name: "Shared one",
  };

  it("keeps edits to a shared build under its own key, restores them, and Revert brings the shared build back", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(SHARED))),
    );
    await renderRoute(`/builder/${VALID_ID}`);
    await screen.findByText("1 attached");
    // Opening it writes nothing.
    expect(localStorage.getItem(sharedDraftKey(VALID_ID))).toBeNull();
    expect(screen.queryByText("Edited from the shared build")).not.toBeInTheDocument();

    const group = await screen.findByRole("group", { name: "Presets" });
    await user.click(within(group).getByRole("button", { name: /^Empty/ }));
    // The shared parts match no preset, so the picker asks before replacing them.
    await user.click(await screen.findByRole("button", { name: "Replace" }));
    expect(await screen.findByText("0 attached")).toBeInTheDocument();
    expect(screen.getByText("Edited from the shared build")).toBeInTheDocument();
    expect(localStorage.getItem(sharedDraftKey(VALID_ID))).not.toBeNull();
    // The /builder draft is another build.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    cleanup();

    await renderRoute(`/builder/${VALID_ID}`);
    expect(await screen.findByText("Edited from the shared build")).toBeInTheDocument();
    expect(await screen.findByText("0 attached")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Shared one")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revert" }));
    await user.click(screen.getByRole("button", { name: "Keep my edits" }));
    expect(screen.getByText("0 attached")).toBeInTheDocument();
    expect(localStorage.getItem(sharedDraftKey(VALID_ID))).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(
      screen.getByText("Discard your edits and go back to the shared build?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(screen.queryByText("Edited from the shared build")).not.toBeInTheDocument();
    expect(localStorage.getItem(sharedDraftKey(VALID_ID))).toBeNull();
  });
});

describe("/builder/$id edits, empty weapon", () => {
  it("says the build is edited only while edits are stored", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            version: 6,
            weaponId: "w-m4a1",
            attachments: { mod_muzzle: "mod-muzzle" },
            orphaned: [],
            createdAt: new Date().toISOString(),
          }),
        ),
      ),
    );
    await renderRoute(`/builder/${VALID_ID}`);
    await screen.findByText("1 attached");
    const weaponSelect = screen
      .getAllByRole<HTMLSelectElement>("combobox")
      .find((el) => el.querySelector('option[value=""]'));
    if (!weaponSelect) throw new Error("weapon <select> not found");

    // No weapon is no build: nothing is stored, and the page does not claim an edit.
    await user.selectOptions(weaponSelect, "");
    expect(localStorage.getItem(sharedDraftKey(VALID_ID))).toBeNull();
    expect(screen.queryByText("Edited from the shared build")).not.toBeInTheDocument();

    await user.selectOptions(weaponSelect, "w-m4a1");
    expect(await screen.findByText("Edited from the shared build")).toBeInTheDocument();
  });
});

describe("/builder/$id edits across a refetch", () => {
  /** Let the query's batched notifications reach the page. */
  const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));

  const SHARED = {
    version: 6,
    weaponId: "w-m4a1",
    attachments: { mod_muzzle: "mod-muzzle" },
    orphaned: [],
    createdAt: new Date().toISOString(),
    name: "Shared one",
  };

  /** Load the shared build with fetch switchable to failing, and empty it: one stored edit. */
  async function editShared() {
    const user = (await import("@testing-library/user-event")).default.setup();
    const net: { fail: boolean; gate: Promise<void> | null } = { fail: false, gate: null };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          net.fail
            ? Promise.reject(new TypeError("Failed to fetch"))
            : (net.gate ?? Promise.resolve()).then(() => jsonResponse(SHARED)),
        ),
    );
    const { queryClient } = await renderRoute(`/builder/${VALID_ID}`);
    await screen.findByText("1 attached");
    const group = await screen.findByRole("group", { name: "Presets" });
    await user.click(within(group).getByRole("button", { name: /^Empty/ }));
    await user.click(await screen.findByRole("button", { name: "Replace" }));
    await screen.findByText("0 attached");
    const stored = localStorage.getItem(sharedDraftKey(VALID_ID));
    expect(stored).not.toBeNull();
    return { user, net, queryClient, stored };
  }

  it("a failed background refetch keeps the editor and the edit", async () => {
    const { user, net, queryClient } = await editShared();
    net.fail = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["build", VALID_ID] });
    });
    await settle();
    expect(screen.getByText("0 attached")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't reach build storage")).not.toBeInTheDocument();

    net.fail = false;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["build", VALID_ID] });
    });
    await settle();
    await user.type(screen.getByPlaceholderText("Build name (optional)"), "X");
    const stored = JSON.parse(localStorage.getItem(sharedDraftKey(VALID_ID)) ?? "") as {
      build: { attachments: object; name: string };
    };
    expect(stored.build).toMatchObject({ attachments: {}, name: "Shared oneX" });
  });

  it("an editor mounted again starts from the stored edit, not the copy read at first mount", async () => {
    const { user, net, queryClient, stored } = await editShared();
    // The build drops out of the cache and loads again: the editor unmounts and mounts anew.
    let open = () => {};
    net.gate = new Promise((r) => (open = r));
    let reset: Promise<void> = Promise.resolve();
    act(() => {
      reset = queryClient.resetQueries({ queryKey: ["build", VALID_ID] });
    });
    expect(await screen.findByRole("status", { busy: true })).toBeInTheDocument();
    await act(async () => {
      open();
      await reset;
    });
    await settle();
    expect(await screen.findByText("0 attached")).toBeInTheDocument();
    expect(screen.getByText("Edited from the shared build")).toBeInTheDocument();
    expect(localStorage.getItem(sharedDraftKey(VALID_ID))).toBe(stored);

    await user.type(screen.getByPlaceholderText("Build name (optional)"), "X");
    const after = JSON.parse(localStorage.getItem(sharedDraftKey(VALID_ID)) ?? "") as {
      build: { attachments: object; name: string };
    };
    expect(after.build).toMatchObject({ attachments: {}, name: "Shared oneX" });
  });
});
