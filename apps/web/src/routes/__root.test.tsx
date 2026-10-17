// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("__root shell (header nav, footer)", () => {
  it("renders the brand and exactly the Builder and Compare nav links", async () => {
    await renderRoute("/");

    expect(screen.getByText("TarkovGunsmith")).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getAllByRole("link").map((el) => el.textContent)).toEqual(["Builder", "Compare"]);
    expect(nav.getByRole("link", { name: "Builder" })).toHaveAttribute("href", "/builder");
    expect(nav.getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/builder/compare");
    expect(nav.queryAllByRole("button")).toEqual([]);
  });

  it("gives /builder the workbench bar in place of the masthead, with no centred frame on <main>", async () => {
    await renderRoute("/builder");

    const bar = await screen.findByRole("region", { name: "Workbench" });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    // The wordmark moves into the workbench bar and still leads home.
    expect(within(bar).getByRole("link", { name: "TarkovGunsmith" })).toHaveAttribute("href", "/");
    expect(within(bar).getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/builder/compare",
    );
    expect(document.querySelector("main")).not.toHaveClass("max-w-6xl");
    // The skip link still lands on <main>.
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("keeps the masthead, Builder marked active, while a shared build /builder/abc12345 loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    await renderRoute("/builder/abc12345");

    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "Builder" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Compare" })).not.toHaveAttribute("aria-current");
  });

  it("marks Compare active on a saved pair /builder/compare/abc12345", async () => {
    await renderRoute("/builder/compare/abc12345");

    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "Compare" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Builder" })).not.toHaveAttribute("aria-current");
  });

  it("marks only Compare active on /builder/compare", async () => {
    await renderRoute("/builder/compare");

    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "Compare" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Builder" })).not.toHaveAttribute("aria-current");
  });

  /**
   * Issue #174, defect 3. <main> was a bare element with no id and the page had no way to
   * bypass the masthead and nav.
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
