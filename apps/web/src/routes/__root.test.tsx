// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";

afterEach(() => cleanup());

/**
 * The id a dropdown trigger's `aria-controls` names. Resolving the panel through the
 * attribute rather than a test id is the point: it proves the association AT relies on is
 * real, and a dangling id fails these tests instead of passing them quietly.
 */
function panelId(trigger: HTMLElement): string {
  const id = trigger.getAttribute("aria-controls");
  if (id === null) throw new Error("trigger has no aria-controls");
  return id;
}

function panelOf(trigger: HTMLElement): HTMLElement {
  const panel = document.getElementById(panelId(trigger));
  if (panel === null) throw new Error(`aria-controls="${panelId(trigger)}" resolves to nothing`);
  return panel;
}

describe("__root shell (header nav, dropdowns, footer)", () => {
  it("renders the brand and a Builder nav link pointing at /builder", async () => {
    await renderRoute("/");

    expect(screen.getByText("TARKOVGUNSMITH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Builder" })).toHaveAttribute("href", "/builder");
  });

  it("opens the Calc dropdown on click and shows its four items linking to the right routes", async () => {
    const user = userEvent.setup();
    await renderRoute("/");

    const trigger = screen.getByRole("button", { name: "Calc" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(panelId(trigger))).toBe(null);

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = panelOf(trigger);
    const items = within(panel).getAllByRole("link");
    expect(items.map((el) => el.textContent)).toEqual([
      "Calc",
      "Simulator",
      "Armor Damage",
      "Armor Effectiveness",
    ]);
    expect(within(panel).getByRole("link", { name: "Calc" })).toHaveAttribute("href", "/calc");
    expect(within(panel).getByRole("link", { name: "Simulator" })).toHaveAttribute("href", "/sim");
    expect(within(panel).getByRole("link", { name: "Armor Damage" })).toHaveAttribute(
      "href",
      "/adc",
    );
    expect(within(panel).getByRole("link", { name: "Armor Effectiveness" })).toHaveAttribute(
      "href",
      "/aec",
    );
  });

  it("opens the Data dropdown on click and shows its three items linking to the right routes", async () => {
    const user = userEvent.setup();
    await renderRoute("/");

    const trigger = screen.getByRole("button", { name: "Data" });
    await user.click(trigger);

    const panel = panelOf(trigger);
    expect(within(panel).getByRole("link", { name: "Ammo × Armor Matrix" })).toHaveAttribute(
      "href",
      "/matrix",
    );
    expect(within(panel).getByRole("link", { name: "Datasheets" })).toHaveAttribute(
      "href",
      "/data",
    );
    expect(within(panel).getByRole("link", { name: "Charts" })).toHaveAttribute("href", "/charts");
  });

  it("closes the dropdown when one of its links is clicked", async () => {
    const user = userEvent.setup();
    await renderRoute("/");

    const trigger = screen.getByRole("button", { name: "Calc" });
    await user.click(trigger);
    await user.click(within(panelOf(trigger)).getByRole("link", { name: "Calc" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(panelId(trigger))).toBe(null);
  });

  /**
   * Issue #174, defect 2. The panel used to declare `role="menu"` with `role="menuitem"` on
   * each <Link>, and the file had no arrow-key handling whatsoever. `role="menuitem"`
   * REPLACES the native link role, so a screen-reader user was told these were menu items
   * that answer Up/Down — and they never did. These are navigation links, so they are now
   * exposed as a disclosure containing a list of links, a contract the component keeps.
   */
  describe("nav dropdown — disclosure semantics and keyboard behaviour (issue #174)", () => {
    it("exposes no ARIA menu roles anywhere in the header", async () => {
      const user = userEvent.setup();
      await renderRoute("/");

      await user.click(screen.getByRole("button", { name: "Calc" }));

      expect(screen.queryAllByRole("menu")).toEqual([]);
      expect(screen.queryAllByRole("menuitem")).toEqual([]);
      // `aria-haspopup="menu"` made the same false promise from the trigger side.
      expect(screen.getByRole("button", { name: "Calc" })).not.toHaveAttribute("aria-haspopup");
    });

    it("points aria-controls at the element the panel actually renders as", async () => {
      const user = userEvent.setup();
      await renderRoute("/");

      const trigger = screen.getByRole("button", { name: "Calc" });
      // A dangling aria-controls is worse than none: it names an element AT can't resolve.
      expect(document.getElementById(panelId(trigger))).toBe(null);

      await user.click(trigger);

      const panel = document.getElementById(panelId(trigger));
      expect(panel).not.toBe(null);
      expect(panel).toBe(within(screen.getByRole("navigation")).getAllByRole("list")[0]);
    });

    it("reaches every link by Tab, in order, without leaving the open panel", async () => {
      const user = userEvent.setup();
      await renderRoute("/");

      const trigger = screen.getByRole("button", { name: "Calc" });
      await user.click(trigger);
      expect(trigger).toHaveFocus();

      for (const name of ["Calc", "Simulator", "Armor Damage", "Armor Effectiveness"]) {
        await user.tab();
        expect(within(panelOf(trigger)).getByRole("link", { name })).toHaveFocus();
      }
      // Still open — Tab traversal through the links must not dismiss the panel.
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("closes and returns focus to the trigger on Escape", async () => {
      const user = userEvent.setup();
      await renderRoute("/");

      const trigger = screen.getByRole("button", { name: "Calc" });
      await user.click(trigger);
      await user.tab();
      expect(within(panelOf(trigger)).getByRole("link", { name: "Calc" })).toHaveFocus();

      await user.keyboard("{Escape}");

      // Focus must not be stranded on a link that no longer exists — the user has to be able
      // to carry on tabbing from where they were.
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
    });

    it("closes when focus leaves the control entirely", async () => {
      const user = userEvent.setup();
      await renderRoute("/");

      const calc = screen.getByRole("button", { name: "Calc" });
      await user.click(calc);
      for (let i = 0; i < 4; i += 1) await user.tab();
      expect(
        within(panelOf(calc)).getByRole("link", { name: "Armor Effectiveness" }),
      ).toHaveFocus();

      // Tabbing past the last link lands on the next nav control. Leaving the panel open
      // behind the user would make the visible state disagree with where focus is.
      await user.tab();
      expect(screen.getByRole("button", { name: "Data" })).toHaveFocus();
      expect(calc).toHaveAttribute("aria-expanded", "false");
    });
  });

  /**
   * Issue #174, defect 3. <main> was a bare element with no id and the page had no way to
   * bypass the masthead and both nav disclosures.
   */
  describe("skip link (issue #174)", () => {
    it("is the first focusable element on the page and targets a focusable <main>", async () => {
      const user = userEvent.setup();
      await renderRoute("/");

      await user.tab();

      const skip = screen.getByRole("link", { name: "Skip to content" });
      expect(skip).toHaveFocus();
      expect(skip).toHaveAttribute("href", "#main-content");

      // The href has to resolve to a real element, and that element has to be focusable —
      // a fragment target with no tabindex leaves focus on the link, so the next Tab
      // resumes in the nav the user just asked to skip.
      const main = document.querySelector("main");
      expect(main).toHaveAttribute("id", "main-content");
      expect(main).toHaveAttribute("tabindex", "-1");
    });
  });

  it("renders the footer GitHub link opening in a new tab", async () => {
    await renderRoute("/");

    const link = screen.getByRole("link", { name: /GitHub/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveAttribute("href", "https://github.com/UnderMyBed/TarkovGunsmith");
  });
});
