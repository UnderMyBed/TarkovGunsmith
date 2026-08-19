// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";

afterEach(() => cleanup());

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
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((el) => el.textContent)).toEqual([
      "Calc",
      "Simulator",
      "Armor Damage",
      "Armor Effectiveness",
    ]);
    expect(within(menu).getByRole("menuitem", { name: "Calc" })).toHaveAttribute("href", "/calc");
    expect(within(menu).getByRole("menuitem", { name: "Simulator" })).toHaveAttribute(
      "href",
      "/sim",
    );
    expect(within(menu).getByRole("menuitem", { name: "Armor Damage" })).toHaveAttribute(
      "href",
      "/adc",
    );
    expect(within(menu).getByRole("menuitem", { name: "Armor Effectiveness" })).toHaveAttribute(
      "href",
      "/aec",
    );
  });

  it("opens the Data dropdown on click and shows its three items linking to the right routes", async () => {
    const user = userEvent.setup();
    await renderRoute("/");

    await user.click(screen.getByRole("button", { name: "Data" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Ammo × Armor Matrix" })).toHaveAttribute(
      "href",
      "/matrix",
    );
    expect(within(menu).getByRole("menuitem", { name: "Datasheets" })).toHaveAttribute(
      "href",
      "/data",
    );
    expect(within(menu).getByRole("menuitem", { name: "Charts" })).toHaveAttribute(
      "href",
      "/charts",
    );
  });

  it("closes the dropdown when a menu item is clicked", async () => {
    const user = userEvent.setup();
    await renderRoute("/");

    const trigger = screen.getByRole("button", { name: "Calc" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Calc" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders the footer GitHub link opening in a new tab", async () => {
    await renderRoute("/");

    const link = screen.getByRole("link", { name: /GitHub/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveAttribute("href", "https://github.com/UnderMyBed/TarkovGunsmith");
  });
});
