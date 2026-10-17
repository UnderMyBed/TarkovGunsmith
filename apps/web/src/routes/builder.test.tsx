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
import { pickWeapon, weaponCombobox } from "../test/pick-weapon.js";

/** The route fixtures' one weapon, as the picker names it. */
const M4A1_NAME = "Colt M4A1 5.56x45 assault rifle";

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

/** A stat's value: the `<dd>` after its `<dt>`, in the stat strip or the Details panel. */
function stat(label: string): HTMLElement {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;
}

const presetSelect = () => screen.getByRole<HTMLSelectElement>("combobox", { name: "Preset" });
const selectedPreset = () => presetSelect().selectedOptions[0]?.textContent ?? "";
const presetOption = (name: RegExp) =>
  within(presetSelect()).getByRole<HTMLOptionElement>("option", { name });

/**
 * Pick the fixture M4A1 (which starts from its default preset: the muzzle and the stock), then
 * clear it with the Empty preset.
 */
/**
 * Select the slot tree's row labelled `slot`, and return the inspector's row for the part whose
 * text matches `name`.
 */
async function partIn(
  user: ReturnType<typeof userEvent.setup>,
  slot: string,
  name: RegExp,
): Promise<HTMLElement> {
  await user.click(screen.getByRole("treeitem", { name: new RegExp(`^${slot}\\b`) }));
  const row = within(screen.getByRole("list", { name: "Parts" }))
    .getAllByRole("listitem")
    .find((li) => name.test(li.textContent ?? ""));
  if (!row) throw new Error(`no ${String(name)} in the ${slot} inspector`);
  return row;
}

async function selectFixtureWeapon(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("1 weapons available on your profile");
  await pickWeapon(user);
  // Slot tree only appears once useWeaponTree resolves.
  await screen.findByText("2 attached", { exact: true });
  await user.selectOptions(presetSelect(), presetOption(/^Empty/));
  await screen.findByText("0 attached", { exact: true });
}

describe("/builder", () => {
  it("starts a picked weapon from its default preset", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await screen.findByText("1 weapons available on your profile");
    await pickWeapon(user);

    expect(await screen.findByText("2 attached", { exact: true })).toBeInTheDocument();
    expect(selectedPreset()).toMatch(/^M4A1 Default \(default\)/);
    // Progression mode: the other preset says what it needs.
    expect(presetOption(/^M4A1 Stock/)).toHaveTextContent("Locked · Mechanic LL2");
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
    expect(screen.getByRole("treeitem", { name: /^Muzzle\b/ })).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    // Stock spec (no mods attached yet).
    expect(stat("Mods attached")).toHaveTextContent("0");
    // The bare gun item's own stats, as upstream publishes them, not an assembled weapon's:
    // #213 shipped from a fixture that gave the receiver 3.4 kg and 47 ergonomics.
    expect(stat("Ergonomics")).toHaveTextContent(/^48$/);
    expect(stat("Vertical recoil")).toHaveTextContent(/^119$/);
    expect(stat("Horizontal recoil")).toHaveTextContent(/^342$/);
    expect(stat("Weight")).toHaveTextContent("0.75 kg");
  });

  it("attaching an available mod updates the mod count; a locked mod renders a Locked pill with its gate", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await selectFixtureWeapon(user);

    const stockButton = await partIn(user, "Stock", /AR-15 Magpul MOE Carbine stock \(FDE\)/);
    // mod-stock (the MOE stock) needs Peacekeeper LL3; DEFAULT_PROFILE's traders are all LL1
    // and flea is off,
    // so itemAvailability has no satisfying path — the SlotInspector renders it LOCKED with the
    // cheapest unmet requirement alongside it.
    expect(within(stockButton).getByText("Locked")).toBeInTheDocument();
    expect(within(stockButton).getByText("Peacekeeper LL3")).toBeInTheDocument();

    const muzzleButton = await partIn(user, "Muzzle", /AR-15 Colt USGI A2 5.56x45 flash hider/);
    // mod-muzzle (the A2 flash hider) needs only Mechanic LL1, available under the default profile.
    expect(within(muzzleButton).getByText("LL1")).toBeInTheDocument();

    await user.click(within(muzzleButton).getByRole("button", { name: /^Fit / }));

    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(stat("Mods attached")).toHaveTextContent("1");
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

    // The toast is a status; so is the weapon picker's (silent) result count.
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("Build URL copied")),
      ).toBe(true),
    );
    expect(screen.getByText(/\/builder\/abcdefgh/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/builds",
      expect.objectContaining({ method: "POST" }),
    );
    // Assert on the mock we created, not on navigator.clipboard.writeText — reading the
    // method back off the object detaches it, which `no-unbound-method` correctly flags.
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/builder/abcdefgh"));
    // The workbench bar marks the build shared.
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("opens the optimizer from the stat strip once a weapon is picked, and round-trips back to the editor", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await selectFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: "Optimize" }));

    // OptimizeView (a separate, already-tested feature component) mounted — its own heading
    // proves BuilderPage's view="optimize" branch rendered it with a ready weapon/tree/spec.
    expect(await screen.findByText(/Optimizer/)).toBeInTheDocument();
    // The editor's Build panel is gone while the optimizer is showing, and so is Optimize.
    expect(screen.queryByRole("region", { name: "Build" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Optimize" })).not.toBeInTheDocument();
  });

  it("opens the progression panel from the optimizer's profile, and stays in the optimizer", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await selectFixtureWeapon(user);
    await user.click(screen.getByRole("button", { name: "Optimize" }));

    await user.click(await screen.findByRole("button", { name: /Edit profile/ }));
    const panel = screen.getByRole("dialog", { name: "Your progression" });
    await user.click(within(panel).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Optimizer/)).toBeInTheDocument();
  });

  it("falls back to a prompt when the optimizer is opened with no weapon selected, and returns to the editor", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder?view=optimize");

    expect(await screen.findByText("Pick a weapon above to optimize.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to editor/ }));

    // Back in the editor view: the empty Build panel says what to do.
    expect(await screen.findByText("No weapon selected")).toBeInTheDocument();
  });

  it("opens the compare-from-build dialog and hands off to /builder/compare on confirm", async () => {
    const user = userEvent.setup();
    const { router } = await renderRoute("/builder");
    await selectFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = screen.getByRole("dialog", { name: "Compare this build" });

    // Default mode is "Clone current build into both sides" — confirm it.
    await user.click(within(dialog).getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/builder/compare"));
    expect(screen.queryByText("Compare this build")).not.toBeInTheDocument();
  });

  it("offers Compare as a link to the Compare page before a weapon is picked", async () => {
    await renderRoute("/builder");
    await screen.findByText("No weapon selected");
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/builder/compare",
    );
    expect(screen.queryByRole("button", { name: "Share build" })).not.toBeInTheDocument();
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
    expect(screen.getByText("Set your progression.")).toBeInTheDocument();
    await pickWeapon(user);
    await screen.findByText("2 attached", { exact: true });

    // The Peacekeeper LL3 stock is open in theorycraft, and the toggle is not offered there.
    const stockButton = await partIn(user, "Stock", /AR-15 Magpul MOE Carbine stock \(FDE\)/);
    expect(within(stockButton).queryByText("Locked")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show all items")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "My progression…" }));
    const panel = screen.getByRole("dialog", { name: "Your progression" });
    await user.click(within(panel).getByRole("button", { name: "LL1" }));
    await screen.findByText("1 weapons available on your profile");
    expect(
      within(await partIn(user, "Stock", /AR-15 Magpul MOE Carbine stock \(FDE\)/)).getByText(
        "Locked",
      ),
    ).toBeInTheDocument();
  });
});

describe("/builder draft", () => {
  async function pickFixture(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("1 weapons available on your profile");
    await pickWeapon(user);
    await screen.findByText("2 attached", { exact: true });
  }

  it("restores the build after the page is opened again", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await pickFixture(user);
    await user.click(
      // The default preset fitted it already, so this is its (inert) Fitted.
      within(await partIn(user, "Muzzle", /AR-15 Colt USGI A2 5.56x45 flash hider/)).getByRole(
        "button",
        { name: /^(Fit|Fitted:) / },
      ),
    );
    await user.type(screen.getByLabelText("Build name"), "Night raid");
    cleanup();

    await renderRoute("/builder");
    expect(await screen.findByDisplayValue("Night raid")).toBeInTheDocument();
    await waitFor(() => expect(weaponCombobox()).toHaveValue(M4A1_NAME));
    expect(await screen.findByText("2 attached", { exact: true })).toBeInTheDocument();
  });

  it("opening the page with a draft writes nothing", async () => {
    const user = userEvent.setup();
    await renderRoute("/builder");
    await pickFixture(user);
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
    await pickFixture(user);

    await user.click(screen.getByRole("button", { name: "New build" }));
    await user.click(screen.getByRole("button", { name: "Keep this build" }));
    expect(screen.getByText("2 attached", { exact: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New build" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("No weapon selected")).toBeInTheDocument();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("an unreadable draft gives an empty builder, warns once, and stays until an edit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error");
    localStorage.setItem(DRAFT_KEY, "{not json");
    const user = userEvent.setup();
    await renderRoute("/builder");

    await screen.findByText("1 weapons available on your profile");
    expect(screen.getByText("No weapon selected")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBe("{not json");

    await pickFixture(user);
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
