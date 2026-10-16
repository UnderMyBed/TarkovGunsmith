// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render-page.js";
import { NavDropdown } from "./nav-dropdown.js";

afterEach(() => cleanup());

const ITEMS = [
  { to: "/builder", label: "First" },
  { to: "/builder/compare", label: "Second" },
] as const;

function Harness() {
  return (
    <nav>
      <NavDropdown label="Menu" items={ITEMS} />
      <button type="button">After</button>
    </nav>
  );
}

function panelOf(trigger: HTMLElement): HTMLElement {
  const id = trigger.getAttribute("aria-controls");
  if (id === null) throw new Error("trigger has no aria-controls");
  const panel = document.getElementById(id);
  if (panel === null) throw new Error(`aria-controls="${id}" resolves to nothing`);
  return panel;
}

/**
 * The dropdown is parked (the header nav is flat while the site is Builder-only) but the
 * component stays in the repo for when grouped navigation returns. These are the
 * disclosure-semantics and keyboard contracts from issue #174 that used to be asserted
 * through the `__root` header.
 */
describe("NavDropdown (parked) — disclosure semantics and keyboard behaviour", () => {
  it("opens on click and lists its links", async () => {
    const user = userEvent.setup();
    await renderPage(<Harness />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("link")).toEqual([]);

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const links = within(panelOf(trigger)).getAllByRole("link");
    expect(links.map((el) => el.textContent)).toEqual(["First", "Second"]);
    expect(links.map((el) => el.getAttribute("href"))).toEqual(["/builder", "/builder/compare"]);
  });

  it("exposes no ARIA menu roles", async () => {
    const user = userEvent.setup();
    await renderPage(<Harness />);

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.queryAllByRole("menu")).toEqual([]);
    expect(screen.queryAllByRole("menuitem")).toEqual([]);
    expect(screen.getByRole("button", { name: "Menu" })).not.toHaveAttribute("aria-haspopup");
  });

  it("reaches every link by Tab without dismissing the panel", async () => {
    const user = userEvent.setup();
    await renderPage(<Harness />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    for (const name of ["First", "Second"]) {
      await user.tab();
      expect(within(panelOf(trigger)).getByRole("link", { name })).toHaveFocus();
    }
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    await renderPage(<Harness />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    await user.tab();
    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes when a link is clicked", async () => {
    const user = userEvent.setup();
    await renderPage(<Harness />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    await user.click(within(panelOf(trigger)).getByRole("link", { name: "First" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when focus leaves the control entirely", async () => {
    const user = userEvent.setup();
    await renderPage(<Harness />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    await user.tab();
    await user.tab();
    await user.tab();

    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
