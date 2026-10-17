// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { stubMatchMedia } from "../test/match-media.js";
import { pickWeapon } from "../test/pick-weapon.js";

/* The Builder at phone width (`usePhoneLayout` answering true): the slot inspector is a bottom
 * sheet opened from a tree row, and Compare and Optimize live in a bar at the bottom of the
 * screen. Driven through the real `/builder` route, as `builder.test.tsx` is. Layout itself
 * (no sideways scroll, the 3×2 strip, the fixed bar) is the phone e2e's: jsdom draws nothing. */

let media: ReturnType<typeof stubMatchMedia>;

beforeEach(() => {
  media = stubMatchMedia(true);
});

afterEach(() => {
  cleanup();
  media.restore();
  localStorage.clear();
});

const muzzleRow = () => screen.getByRole("treeitem", { name: /^Muzzle\b/ });
const actionBar = () => screen.getByRole("navigation", { name: "Build actions" });

async function pickTheM4A1(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await renderRoute("/builder");
  await pickWeapon(user);
  await screen.findByText("2 attached", { exact: true });
}

describe("/builder on a phone", () => {
  it("opens a row's parts in a sheet, fits one, closes, and returns focus to the row", async () => {
    const user = userEvent.setup();
    await pickTheM4A1(user);
    // No inspector beside the tree: the parts are in the sheet, once a row is tapped.
    expect(screen.queryByRole("region", { name: / options$/ })).not.toBeInTheDocument();

    await user.click(muzzleRow());
    const sheet = screen.getByRole("dialog", { name: "Muzzle options" });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    // The same inspector as on a desktop: search, sort and the parts.
    expect(within(sheet).getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
    expect(within(sheet).getByRole("combobox", { name: "Sort by" })).toBeInTheDocument();

    // Remove closes the sheet; the row says the slot is empty and has the focus.
    await user.click(within(sheet).getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("1 attached", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(muzzleRow()).toHaveFocus());
    expect(muzzleRow()).toHaveAccessibleName(/^Muzzle: empty/);

    // Fit closes it too, and the row shows the part.
    await user.click(muzzleRow());
    const again = screen.getByRole("dialog", { name: "Muzzle options" });
    await user.click(within(again).getByRole("button", { name: /^Fit AR-15 Colt USGI A2/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("2 attached", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(muzzleRow()).toHaveFocus());
    expect(muzzleRow()).toHaveAccessibleName(/^Muzzle: AR-15 Colt USGI A2/);
  });

  it("closes the sheet on Escape and on Close, focus back on the row each time", async () => {
    const user = userEvent.setup();
    await pickTheM4A1(user);

    await user.click(muzzleRow());
    expect(screen.getByRole("dialog", { name: "Muzzle options" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(muzzleRow()).toHaveFocus());

    // Enter on the focused row opens it again, as a tap does.
    await user.keyboard("{Enter}");
    const sheet = screen.getByRole("dialog", { name: "Muzzle options" });
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(muzzleRow()).toHaveFocus());
  });

  it("opens the sheet on Space's release, so the release does not close it again", async () => {
    const user = userEvent.setup();
    await pickTheM4A1(user);
    muzzleRow().focus();

    await user.keyboard("[Space>]");
    // Pressed, not yet released: nothing has opened to take the release.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("[/Space]");
    const sheet = screen.getByRole("dialog", { name: "Muzzle options" });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    // A further press and release lands on the sheet's focused Close button, as it should.
    await user.keyboard(" ");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet for good when history leaves the editor under it", async () => {
    const user = userEvent.setup();
    const { router } = await renderRoute("/builder");
    await pickWeapon(user);
    await screen.findByText("2 attached", { exact: true });
    await user.click(muzzleRow());
    expect(screen.getByRole("dialog", { name: "Muzzle options" })).toBeInTheDocument();

    await act(() => router.navigate({ to: "/builder", search: { view: "optimize" } }));
    expect(await screen.findByRole("complementary", { name: "Optimizer" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(() => router.navigate({ to: "/builder", search: { view: "editor" } }));
    expect(await screen.findByRole("region", { name: "Build" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("puts Compare and Optimize in the bottom bar, and Back to build there in the optimizer", async () => {
    const user = userEvent.setup();
    // Before a weapon, Compare is the link to the Compare page, and there is nothing to optimize.
    await renderRoute("/builder");
    await screen.findByText("No weapon selected");
    expect(within(actionBar()).getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/builder/compare",
    );
    expect(within(actionBar()).queryByRole("button", { name: "Optimize" })).toBeNull();

    await pickWeapon(user);
    await screen.findByText("2 attached", { exact: true });
    // One Compare and one Optimize on the page, both in the bar.
    expect(screen.getAllByRole("button", { name: "Compare" })).toEqual([
      within(actionBar()).getByRole("button", { name: "Compare" }),
    ]);
    expect(screen.getAllByRole("button", { name: "Optimize" })).toEqual([
      within(actionBar()).getByRole("button", { name: "Optimize" }),
    ]);
    // Share stays in the top bar.
    expect(
      within(screen.getByRole("region", { name: "Workbench" })).getByRole("button", {
        name: "Share build",
      }),
    ).toBeInTheDocument();

    await user.click(within(actionBar()).getByRole("button", { name: "Optimize" }));
    expect(await screen.findByRole("complementary", { name: "Optimizer" })).toBeInTheDocument();
    await user.click(within(actionBar()).getByRole("button", { name: "Back to build" }));
    expect(await screen.findByRole("region", { name: "Build" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Optimizer" })).not.toBeInTheDocument();
  });

  it("goes back to the desktop layout when the window widens", async () => {
    const user = userEvent.setup();
    await pickTheM4A1(user);
    await user.click(muzzleRow());
    expect(screen.getByRole("dialog", { name: "Muzzle options" })).toBeInTheDocument();

    act(() => media.set(false));
    // The sheet gives way to the inspector beside the tree, on the same slot.
    expect(await screen.findByRole("region", { name: "Muzzle options" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Build actions" })).not.toBeInTheDocument();
  });
});
