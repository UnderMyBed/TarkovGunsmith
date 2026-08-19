// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

describe("/charts", () => {
  it("shows the placeholder until an ammo is picked, then loads options", async () => {
    await renderRoute("/charts");

    expect(screen.getByText("Pick an ammo to render the chart.")).toBeInTheDocument();
    const ammoSelect = await screen.findByLabelText("Ammo");
    await waitFor(() => expect(ammoSelect).not.toBeDisabled());
    expect(screen.getByText("5.56x45mm M855")).toBeInTheDocument();
    expect(screen.getByText("5.56x45mm M995")).toBeInTheDocument();
  });

  it("renders the chart section with its legend once an ammo is selected", async () => {
    const user = userEvent.setup();
    await renderRoute("/charts");

    const ammoSelect = await screen.findByLabelText("Ammo");
    await waitFor(() => expect(ammoSelect).not.toBeDisabled());
    await user.selectOptions(ammoSelect, "ammo-m855");

    expect(screen.queryByText("Pick an ammo to render the chart.")).not.toBeInTheDocument();
    expect(screen.getByText("Shots to break, by armor")).toBeInTheDocument();
    expect(screen.getByText("reliable (≤ shot cap)")).toBeInTheDocument();
    expect(screen.getByText("marginal (≤ 2× cap)")).toBeInTheDocument();
    expect(screen.getByText("ineffective (∞ or > 2× cap)")).toBeInTheDocument();
  });

  it("stays mounted when shot cap and distance inputs change", async () => {
    const user = userEvent.setup();
    await renderRoute("/charts");

    const ammoSelect = await screen.findByLabelText("Ammo");
    await waitFor(() => expect(ammoSelect).not.toBeDisabled());
    await user.selectOptions(ammoSelect, "ammo-m995");
    expect(screen.getByText("Shots to break, by armor")).toBeInTheDocument();

    const shotCap = screen.getByLabelText("Shot cap");
    await user.clear(shotCap);
    await user.type(shotCap, "10");
    expect(screen.getByText("Shots to break, by armor")).toBeInTheDocument();

    // The distance label wraps no extra caption in this route, but match loosely for
    // resilience against label-text changes.
    const distance = screen.getByLabelText(/Distance \(m\)/);
    await user.clear(distance);
    await user.type(distance, "25");
    expect(screen.getByText("Shots to break, by armor")).toBeInTheDocument();
  });

  it("shows an error card when the items resource fails to load", async () => {
    await renderRoute("/charts", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
