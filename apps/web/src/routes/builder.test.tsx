// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";
import { createTestBuilderData } from "../test/test-builder-data.js";
import { SnapshotVersionError, type BuilderDataSource } from "@tarkov/data";
import { DRAFT_KEY } from "../features/builder/build-draft.js";

// `BuilderPage` was 512 lines / 12 useState / 45 hook calls in one function body, and these
// tests were written as the behaviour net that made decomposing it safe.
// These tests drive it through the REAL `/builder` route (real router, real fetchers,
// real Zod schemas) rather than importing `BuilderPage` directly, so `useNavigate` /
// `Route.useSearch` work exactly as they do in production.

// The behaviour these tests protect is gating on DEFAULT_PROFILE, which is progression mode: a
// visitor who chose progression without changing the profile. A first visit is theorycraft;
// `/builder on a first visit` below covers that.
beforeEach(() => localStorage.setItem("tg:builder-mode", "progression"));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // The page keeps its build in localStorage: each test starts without one.
  localStorage.clear();
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

/**
 * Wait for the weapon <select> to finish loading, select the fixture M4A1 (which starts from
 * its default preset: the muzzle and the stock), then clear it with "Empty".
 */
async function selectFixtureWeapon(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("1 weapons available on your profile");
  const weaponSelect = findWeaponSelect();
  await waitFor(() => expect(weaponSelect).not.toBeDisabled());
  await user.selectOptions(weaponSelect, "w-m4a1");
  // Slot tree only appears once useWeaponTree resolves.
  await screen.findByText("2 attached", { exact: true });
  await user.click(presetChip(/^Empty/));
  await screen.findByText("0 attached", { exact: true });
  return weaponSelect;
}

function presetChip(name: RegExp): HTMLElement {
  return within(screen.getByRole("group", { name: "Presets" })).getByRole("button", { name });
}

describe("/builder", () => {
  it("starts a picked weapon from its default preset", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await screen.findByText("1 weapons available on your profile");
    const weaponSelect = findWeaponSelect();
    await waitFor(() => expect(weaponSelect).not.toBeDisabled());
    await user.selectOptions(weaponSelect, "w-m4a1");

    expect(await screen.findByText("2 attached", { exact: true })).toBeInTheDocument();
    expect(presetChip(/^M4A1 Default/)).toHaveAttribute("aria-pressed", "true");
    expect(presetChip(/^M4A1 Stock/)).toHaveAttribute("aria-pressed", "false");
    // Progression mode: the other preset says what it needs.
    expect(within(presetChip(/^M4A1 Stock/)).getByText("mechanic LL2")).toBeInTheDocument();
  });

  it("lists the fixture weapon as available, then loads its slot tree + stock spec on selection", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");

    // DEFAULT_PROFILE is all-LL1/no-flea. The bare M4A1 needs Mechanic LL3, but its default
    // preset is Prapor LL1, so it shows up under progression's "available on your profile".
    await waitFor(() =>
      expect(screen.getByText("1 weapons available on your profile")).toBeInTheDocument(),
    );

    await selectFixtureWeapon(user);

    // Both fixture slots resolved from the weapon's raw `properties.slots`.
    expect(screen.getByText("Muzzle")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    // Stock spec (no mods attached yet).
    expect(screen.getByText(withNormalizedText("M4A1 with 0 mods"))).toBeInTheDocument();
    // The bare gun item's own stats, as upstream publishes them, not an assembled weapon's:
    // #213 shipped from a fixture that gave the receiver 3.4 kg and 47 ergonomics.
    const stat = (label: string) =>
      screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(stat("Ergonomics")).toHaveTextContent("48.0");
    expect(stat("Vert. recoil")).toHaveTextContent("119.0");
    expect(stat("Horiz. recoil")).toHaveTextContent("342.0");
    expect(stat("Weight")).toHaveTextContent("0.75 kg");
  });

  it("attaching an available mod updates the mod count; a locked mod renders a LOCKED pill with its gate", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await selectFixtureWeapon(user);

    const stockButton = screen.getByRole("button", {
      name: /AR-15 Magpul MOE Carbine stock \(FDE\)/,
    });
    // mod-stock (the MOE stock) needs Peacekeeper LL3; DEFAULT_PROFILE's traders are all LL1
    // and flea is off,
    // so itemAvailability has no satisfying path — the SlotTree renders it LOCKED with the
    // cheapest unmet requirement alongside it.
    expect(within(stockButton).getByText("LOCKED")).toBeInTheDocument();
    expect(within(stockButton).getByText("peacekeeper LL3")).toBeInTheDocument();

    const muzzleButton = screen.getByRole("button", {
      name: /AR-15 Colt USGI A2 5.56x45 flash hider/,
    });
    // mod-muzzle (the A2 flash hider) needs only Mechanic LL1, available under the default profile.
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
    expect(await screen.findByText("1 weapons available on your profile")).toBeInTheDocument();
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

describe("/builder on a first visit", () => {
  beforeEach(() => localStorage.clear());

  it("opens in theorycraft, every gate open, with the progression prompt", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await screen.findByText("1 weapons");
    expect(screen.getByText("Set your progression")).toBeInTheDocument();
    const weaponSelect = findWeaponSelect();
    await waitFor(() => expect(weaponSelect).not.toBeDisabled());
    await user.selectOptions(weaponSelect, "w-m4a1");
    await screen.findByText("2 attached", { exact: true });

    // The Peacekeeper LL3 stock is open in theorycraft, and the toggle is not offered there.
    const stockButton = screen.getByRole("button", {
      name: /AR-15 Magpul MOE Carbine stock \(FDE\)/,
    });
    expect(within(stockButton).queryByText("LOCKED")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show all items")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "LL1" }));
    await screen.findByText("1 weapons available on your profile");
    expect(within(stockButton).getByText("LOCKED")).toBeInTheDocument();
  });
});

describe("/builder draft", () => {
  async function pickWeapon(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("1 weapons available on your profile");
    const weaponSelect = findWeaponSelect();
    await waitFor(() => expect(weaponSelect).not.toBeDisabled());
    await user.selectOptions(weaponSelect, "w-m4a1");
    await screen.findByText("2 attached", { exact: true });
  }

  it("restores the build after the page is opened again", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await pickWeapon(user);
    await user.click(
      screen.getByRole("button", { name: /AR-15 Colt USGI A2 5.56x45 flash hider/ }),
    );
    await user.type(screen.getByPlaceholderText("Build name (optional)"), "Night raid");
    cleanup();

    await renderRoute("/builder");
    expect(await screen.findByDisplayValue("Night raid")).toBeInTheDocument();
    await waitFor(() => expect(findWeaponSelect()).toHaveValue("w-m4a1"));
    expect(await screen.findByText("2 attached", { exact: true })).toBeInTheDocument();
  });

  it("opening the page with a draft writes nothing", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await pickWeapon(user);
    const stored = localStorage.getItem(DRAFT_KEY);
    expect(stored).not.toBeNull();
    cleanup();

    await renderRoute("/builder");
    await screen.findByText("2 attached", { exact: true });
    expect(localStorage.getItem(DRAFT_KEY)).toBe(stored);
  });

  it("New build asks first, then discards the draft and empties the builder", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    expect(screen.queryByRole("button", { name: "New build" })).not.toBeInTheDocument();
    await pickWeapon(user);

    await user.click(screen.getByRole("button", { name: "New build" }));
    await user.click(screen.getByRole("button", { name: "Keep this build" }));
    expect(screen.getByText("2 attached", { exact: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New build" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("NO WEAPON SELECTED")).toBeInTheDocument();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("an unreadable draft gives an empty builder, warns once, and stays until an edit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error");
    localStorage.setItem(DRAFT_KEY, "{not json");
    const user = userEvent.setup();
    await renderRoute("/builder");

    await screen.findByText("1 weapons available on your profile");
    expect(screen.getByText("NO WEAPON SELECTED")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBe("{not json");

    await pickWeapon(user);
    expect(localStorage.getItem(DRAFT_KEY)).toContain('"weaponId":"w-m4a1"');
  });
});

describe("/builder draft when the game data fails", () => {
  const STORED = JSON.stringify({
    draft: 1,
    writtenAt: 1,
    build: {
      version: 6,
      weaponId: "w-m4a1",
      attachments: {},
      orphaned: [],
      createdAt: new Date(1).toISOString(),
      name: "Mine",
    },
  });

  /** A source whose snapshot fails with `error` until `net.fail` is cleared, counting calls. */
  async function failingSource(error: Error) {
    const good = await createTestBuilderData(createTestClient());
    const net = { fail: true, calls: 0 };
    const source: BuilderDataSource = {
      ...good,
      snapshot: () => {
        net.calls++;
        return net.fail ? Promise.reject(error) : good.snapshot();
      },
    };
    return { source, net };
  }

  const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

  it("shows the error once, keeps the draft, and loads it on Try again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(DRAFT_KEY, STORED);
    const { source, net } = await failingSource(new Error("snapshot down"));
    const user = userEvent.setup();
    await renderRoute("/builder", { builderData: source });

    await wait(500);
    expect(net.calls).toBeLessThanOrEqual(2);
    expect(screen.getByText("Game data couldn't be loaded")).toBeInTheDocument();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(STORED);

    net.fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue("Mine")).toBeInTheDocument();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(STORED);
  });

  it("after a deploy, asks for a reload instead of retrying", async () => {
    localStorage.setItem(DRAFT_KEY, STORED);
    const { source, net } = await failingSource(new SnapshotVersionError(0));
    await renderRoute("/builder", { builderData: source });

    await wait(500);
    expect(net.calls).toBeLessThanOrEqual(2);
    expect(screen.getByText("Game data was updated. Reload the page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(STORED);
  });
});
