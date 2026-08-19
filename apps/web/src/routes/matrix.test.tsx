// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

describe("/matrix", () => {
  it("renders a full ammo x armor grid once both lists load", async () => {
    await renderRoute("/matrix");

    // "2 ammo × 2 armor = 4 cells" once the fixture's two ammo + two armor land.
    await waitFor(() => expect(screen.getByText("2 ammo × 2 armor = 4 cells")).toBeInTheDocument());

    const table = screen.getByRole("table");
    // One header column per armor (plus the corner cell).
    expect(within(table).getByText("6B13")).toBeInTheDocument();
    expect(within(table).getByText("Altyn")).toBeInTheDocument();
    // One row per ammo.
    expect(within(table).getByText("M855")).toBeInTheDocument();
    expect(within(table).getByText("M995")).toBeInTheDocument();
    // 2x2 grid = 4 data cells, each holding a shots-to-break number or "—".
    const dataCells = within(table)
      .getAllByRole("cell")
      .filter((cell) => cell.parentElement?.tagName === "TR" && cell.textContent !== "");
    expect(dataCells).toHaveLength(4);
  });

  it("filters ammo rows by name via the search input", async () => {
    const user = userEvent.setup();
    await renderRoute("/matrix");
    await waitFor(() => expect(screen.getByText("2 ammo × 2 armor = 4 cells")).toBeInTheDocument());

    const search = screen.getByLabelText("Filter ammo by name or caliber");
    await user.type(search, "M995");

    await waitFor(() => expect(screen.getByText("1 ammo × 2 armor = 2 cells")).toBeInTheDocument());
    const table = screen.getByRole("table");
    expect(within(table).getByText("M995")).toBeInTheDocument();
    expect(within(table).queryByText("M855")).not.toBeInTheDocument();
  });

  it("caps ammo rows via the top-N input, keeping the highest-penetration ammo first", async () => {
    await renderRoute("/matrix");
    await waitFor(() => expect(screen.getByText("2 ammo × 2 armor = 4 cells")).toBeInTheDocument());

    const topN = screen.getByLabelText("Show top N (by penetration)");
    // Not userEvent.clear()+type(): this is a controlled number input whose onChange falls
    // back to "1" on an empty/invalid value, so clear() snaps the displayed value back to
    // "1" before typing ever happens — set the whole value in one change instead.
    fireEvent.change(topN, { target: { value: "1" } });

    await waitFor(() => expect(screen.getByText("1 ammo × 2 armor = 2 cells")).toBeInTheDocument());
    const table = screen.getByRole("table");
    // ammo-m995 has the higher penetrationPower (58 vs 31), so a top-1 cap keeps it.
    expect(within(table).getByText("M995")).toBeInTheDocument();
    expect(within(table).queryByText("M855")).not.toBeInTheDocument();
  });

  it("shows an error card when the items resource fails to load", async () => {
    await renderRoute("/matrix", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
