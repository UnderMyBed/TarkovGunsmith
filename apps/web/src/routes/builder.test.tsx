// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useV1Migration } from "../features/builder/useV1Migration.js";
import type { SlotNodeForMigration } from "@tarkov/data";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

// `BuilderPage` is 512 lines / 12 useState / 45 hook calls in one function body (see
// docs/plans/2026-08-19-pre-refactor-hardening-plan.md, Stage 1.4) and is the priority
// surface for this unit — Stage 5.1 decomposes it and needs this as a behaviour net.
// These tests drive it through the REAL `/builder` route (real router, real fetchers,
// real Zod schemas) rather than importing `BuilderPage` directly, so `useNavigate` /
// `Route.useSearch` work exactly as they do in production.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* Two suites live here, from two separate units that both landed a builder.test.tsx.
 * `useV1Migration` unit-tests the hook extracted when the v1-build migration moved out of
 * a setState-in-effect; `/builder` drives the whole route. They are kept together because
 * the file name is determined by the route, not by either unit. */

const treeA: readonly SlotNodeForMigration[] = [
  {
    nameId: "muzzle",
    path: "muzzle",
    allowedItemIds: new Set(["mod-a"]),
    children: [],
  },
];

// A second, differently-shaped tree. Used to prove migration runs at most once: if the
// `migrated` guard were ever lost, a later prop change would silently re-migrate against
// stale initialModIds and clobber whatever the user has since attached.
const treeB: readonly SlotNodeForMigration[] = [
  {
    nameId: "muzzle",
    path: "muzzle",
    allowedItemIds: new Set(["mod-z"]),
    children: [],
  },
];

interface HarnessProps {
  modIds: string[] | undefined;
  treeSlots: readonly SlotNodeForMigration[] | undefined;
}

function useHarness({ modIds, treeSlots }: HarnessProps) {
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const [orphaned, setOrphaned] = useState<string[]>([]);
  useV1Migration("w1", modIds, treeSlots, setAttachments, setOrphaned);
  return { attachments, orphaned };
}

describe("useV1Migration", () => {
  it("does not migrate while the weapon tree has not loaded yet", () => {
    const { result } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-a"], treeSlots: undefined },
    });
    expect(result.current.attachments).toEqual({});
    expect(result.current.orphaned).toEqual([]);
  });

  it("migrates attachments as soon as the tree becomes available", () => {
    const { result, rerender } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-a"], treeSlots: undefined },
    });
    rerender({ modIds: ["mod-a"], treeSlots: treeA });
    expect(result.current.attachments).toEqual({ muzzle: "mod-a" });
    expect(result.current.orphaned).toEqual([]);
  });

  it("migrates orphaned mods that don't match any slot", () => {
    const { result, rerender } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-unknown"], treeSlots: undefined },
    });
    rerender({ modIds: ["mod-unknown"], treeSlots: treeA });
    expect(result.current.attachments).toEqual({});
    expect(result.current.orphaned).toEqual(["mod-unknown"]);
  });

  it("migrates exactly once — a later tree change does not re-run it", () => {
    // Regression test for the guard itself: without `migrated` gating the render-time
    // check, every render where `initialModIds && treeSlots` are both still truthy would
    // re-run the migration and stomp the attachments the user has since edited.
    const { result, rerender } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-a"], treeSlots: undefined },
    });
    rerender({ modIds: ["mod-a"], treeSlots: treeA });
    expect(result.current.attachments).toEqual({ muzzle: "mod-a" });

    rerender({ modIds: ["mod-a"], treeSlots: treeB });
    // Still the treeA result — treeB's mapping (mod-z, not mod-a) never got applied.
    expect(result.current.attachments).toEqual({ muzzle: "mod-a" });
  });

  it("does nothing when there are no v1 modIds to migrate", () => {
    const { result } = renderHook(useHarness, {
      initialProps: { modIds: undefined, treeSlots: treeA },
    });
    expect(result.current.attachments).toEqual({});
  });
});

/**
 * The "Spec" card's description is `<code>{shortName}</code> with {modCount} mods` — the
 * short name lives in a child `<code>`, so its parent's own text nodes never contain the
 * full sentence and the default single-node `getByText` match fails ("text is broken up by
 * multiple elements"). Match on the element's full `textContent` instead.
 */
function withNormalizedText(expected: string) {
  return (_: string, node: Element | null) =>
    node?.textContent?.replace(/\s+/g, " ").trim() === expected;
}

/**
 * The weapon picker is one of MANY `role="combobox"` elements on this page once the
 * ProfileEditor mounts (a `<select>` per trader for its loyalty level) — find it by its
 * distinguishing feature (an empty-value `<option>`, "Loading…"/"Select weapon…") rather
 * than by role alone.
 */
function findWeaponSelect(): HTMLSelectElement {
  const combos = screen.getAllByRole<HTMLSelectElement>("combobox");
  const found = combos.find((el) => el.querySelector('option[value=""]'));
  if (!found) throw new Error("weapon <select> not found among comboboxes");
  return found;
}

/** Wait for the weapon <select> to finish loading and select the fixture M4A1. */
async function selectFixtureWeapon(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("1 weapons available on your profile");
  const weaponSelect = findWeaponSelect();
  await waitFor(() => expect(weaponSelect).not.toBeDisabled());
  await user.selectOptions(weaponSelect, "w-m4a1");
  // Slot tree only appears once useWeaponTree resolves.
  await screen.findByText("0 attached");
  return weaponSelect;
}

describe("/builder", () => {
  it("lists the fixture weapon as available, then loads its slot tree + stock spec on selection", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");

    // DEFAULT_PROFILE is all-LL1/no-flea; the fixture weapon needs Prapor LL1, so it shows
    // up under the default "available on your profile" filter without touching "Show all
    // weapons" first.
    await waitFor(() =>
      expect(screen.getByText("1 weapons available on your profile")).toBeInTheDocument(),
    );

    await selectFixtureWeapon(user);

    // Both fixture slots resolved from the weapon's raw `properties.slots`.
    expect(screen.getByText("Muzzle")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    // Stock spec (no mods attached yet).
    expect(screen.getByText(withNormalizedText("M4A1 with 0 mods"))).toBeInTheDocument();
  });

  it("attaching an available mod updates the mod count; a locked mod renders a LOCKED pill with its gate", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await selectFixtureWeapon(user);

    const stockButton = screen.getByRole("button", { name: /Magpul CTR carbine stock/ });
    // mod-stock needs Mechanic LL2; DEFAULT_PROFILE's traders are all LL1 and flea is off,
    // so itemAvailability has no satisfying path — the SlotTree renders it LOCKED with the
    // cheapest unmet requirement alongside it.
    expect(within(stockButton).getByText("LOCKED")).toBeInTheDocument();
    expect(within(stockButton).getByText("mechanic LL2")).toBeInTheDocument();

    const muzzleButton = screen.getByRole("button", { name: /Zenit DTK-1 muzzle brake/ });
    // mod-muzzle needs only Prapor LL1 — available under the default profile.
    expect(within(muzzleButton).getByText("LL1")).toBeInTheDocument();

    await user.click(muzzleButton);

    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText(withNormalizedText("M4A1 with 1 mod"))).toBeInTheDocument();
  });

  it("shares the current build: POSTs it, shows the copied-URL toast, and writes to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abcdefgh", url: "ignored" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderRoute("/builder");
    await selectFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: "Share build" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Build URL copied");
    expect(screen.getByText(/\/builder\/abcdefgh/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/builds",
      expect.objectContaining({ method: "POST" }),
    );
    // Assert on the mock we created, not on navigator.clipboard.writeText — reading the
    // method back off the object detaches it, which `no-unbound-method` correctly flags.
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/builder/abcdefgh"));
  });

  it("opens the optimizer from the header once a weapon is picked, and round-trips back to the editor", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await selectFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: /OPTIMIZE/ }));

    // OptimizeView (a separate, already-tested feature component) mounted — its own heading
    // proves BuilderPage's view="optimize" branch rendered it with a ready weapon/tree/spec.
    expect(await screen.findByText(/OPTIMIZER/)).toBeInTheDocument();
    // The editor's own "Weapon" picker card is gone while the optimizer is showing.
    expect(screen.queryByText("1 weapons available on your profile")).not.toBeInTheDocument();
  });

  it("falls back to a prompt when the optimizer is opened with no weapon selected, and returns to the editor", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder?view=optimize");

    expect(
      await screen.findByText("Pick a weapon in the editor before running the optimizer."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to editor/ }));

    // Back in the editor view — the weapon picker card is back.
    expect(
      await screen.findByText(/weapons? (available on your profile|\(all\))/),
    ).toBeInTheDocument();
  });

  it("opens the compare-from-build dialog and hands off to /builder/compare on confirm", async () => {
    const user = userEvent.setup();
    const { router } = await renderRoute("/builder");
    await selectFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: "Compare ↔" }));
    expect(screen.getByText("Compare this build")).toBeInTheDocument();

    // Default mode is "Clone current build into both sides" — confirm it.
    await user.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/builder/compare"));
    expect(screen.queryByText("Compare this build")).not.toBeInTheDocument();
  });

  it("surfaces a data error when the items resource fails to load", async () => {
    await renderRoute("/builder", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
