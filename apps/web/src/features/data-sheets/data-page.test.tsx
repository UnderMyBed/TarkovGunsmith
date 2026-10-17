// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render-page.js";
import { DataPage } from "./data-page.js";
import { createTestClient } from "../../test/test-client.js";

afterEach(() => cleanup());

function rowsOf(table: HTMLElement) {
  return within(table).getAllByRole("row").slice(1); // drop the header row
}

describe("data page (parked, no route)", () => {
  it("defaults to the Ammo tab with both fixture ammo rows", async () => {
    await renderPage(<DataPage />);

    const table = await screen.findByRole("table");
    expect(await screen.findByText("2 rows")).toBeInTheDocument();
    expect(within(table).getByText("5.56x45mm M855")).toBeInTheDocument();
    expect(within(table).getByText("5.56x45mm M995")).toBeInTheDocument();
    // Default sort is ascending by name — M855 sorts before M995.
    const rows = rowsOf(table);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("5.56x45mm M855");
    expect(rows[1]).toHaveTextContent("5.56x45mm M995");
  });

  it("switches to the Armor tab and shows both fixture armor rows", async () => {
    const user = userEvent.setup();
    await renderPage(<DataPage />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "ARMOR" }));

    const table = await screen.findByRole("table");
    expect(screen.getByText("2 rows")).toBeInTheDocument();
    expect(within(table).getByText("6B13 assault armor (M)")).toBeInTheDocument();
    expect(within(table).getByText("Altyn helmet")).toBeInTheDocument();
  });

  it("switches to the Weapons tab (1 row) and the Modules tab (6 rows)", async () => {
    const user = userEvent.setup();
    await renderPage(<DataPage />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "WEAPONS" }));
    let table = await screen.findByRole("table");
    expect(screen.getByText("1 row")).toBeInTheDocument();
    expect(within(table).getByText("Colt M4A1 5.56x45 assault rifle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "MODULES" }));
    table = await screen.findByRole("table");
    // Every slot-attachable part type: mods, a barrel, a scope and a magazine.
    expect(screen.getByText("6 rows")).toBeInTheDocument();
    expect(within(table).getByText("AR-15 Colt USGI A2 5.56x45 flash hider")).toBeInTheDocument();
    expect(within(table).getByText("AR-15 5.56x45 10.3 inch barrel")).toBeInTheDocument();
    expect(
      within(table).getByText("Leupold Mark 4 HAMR 4x24 DeltaPoint hybrid assault scope"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("AR-15 5.56x45 Colt STANAG 30-round magazine"),
    ).toBeInTheDocument();
  });

  it("filters the active tab's rows by name", async () => {
    const user = userEvent.setup();
    await renderPage(<DataPage />);
    const table = await screen.findByRole("table");
    expect(rowsOf(table)).toHaveLength(2);

    await user.type(screen.getByPlaceholderText("Filter by name…"), "M995");

    expect(await screen.findByText("1 row")).toBeInTheDocument();
    const filtered = rowsOf(screen.getByRole("table"));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toHaveTextContent("5.56x45mm M995");
  });

  it("toggles sort direction when a column header is clicked twice", async () => {
    const user = userEvent.setup();
    await renderPage(<DataPage />);
    await screen.findByRole("table");

    // Ascending by default: Name header already shows the ascending indicator.
    const nameHeaderBtn = screen.getByRole("button", { name: /^Name/ });
    expect(nameHeaderBtn).toHaveTextContent("▲");

    // First click on the currently-active column flips to descending.
    await user.click(nameHeaderBtn);
    expect(screen.getByRole("button", { name: /^Name/ })).toHaveTextContent("▼");
    let rows = rowsOf(screen.getByRole("table"));
    expect(rows[0]).toHaveTextContent("5.56x45mm M995");
    expect(rows[1]).toHaveTextContent("5.56x45mm M855");

    // Clicking a different column (Pen) makes it the active ascending sort.
    await user.click(screen.getByRole("button", { name: /^Pen/ }));
    const penHeaderBtn = screen.getByRole("button", { name: /^Pen/ });
    expect(penHeaderBtn).toHaveTextContent("▲");
    rows = rowsOf(screen.getByRole("table"));
    // M855 has penetrationPower 31, M995 has 58 — ascending puts M855 first.
    expect(rows[0]).toHaveTextContent("5.56x45mm M855");
    expect(rows[1]).toHaveTextContent("5.56x45mm M995");
  });

  it("shows an error card on the active tab when the items resource fails", async () => {
    await renderPage(<DataPage />, { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load:/)).toBeInTheDocument();
  });
});
