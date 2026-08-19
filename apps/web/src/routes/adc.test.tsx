// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

async function selectAmmoAndArmor(user: ReturnType<typeof userEvent.setup>) {
  const ammoSelect = await screen.findByLabelText("Ammo");
  // `findByLabelText` resolves as soon as the <select> exists, which is before
  // useAmmoList/useArmorList settle (it starts disabled with only "Loading…").
  await waitFor(() => expect(ammoSelect).not.toBeDisabled());
  await user.selectOptions(ammoSelect, "ammo-m855");
  await user.selectOptions(screen.getByLabelText("Armor"), "armor-6b13");
}

function bodyRows(): HTMLTableRowElement[] {
  const table = screen.getByRole("table");
  return Array.from(table.querySelectorAll("tbody tr"));
}

describe("/adc", () => {
  it("shows the picker prompt before an ammo + armor are both selected", async () => {
    await renderRoute("/adc");
    const ammoSelect = await screen.findByLabelText("Ammo");
    // The prompt is gated on `!isLoading` too, so wait for data to actually settle.
    await waitFor(() => expect(ammoSelect).not.toBeDisabled());
    expect(screen.getByText("Pick an ammo and an armor to see the burst.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a per-shot results table with summary stats once ammo + armor are picked", async () => {
    const user = userEvent.setup();
    await renderRoute("/adc");
    await selectAmmoAndArmor(user);

    expect(await screen.findByText("First penetration")).toBeInTheDocument();
    expect(screen.getByText("Total flesh damage")).toBeInTheDocument();
    expect(screen.getByText("Final durability")).toBeInTheDocument();
    expect(screen.getByText("Final durability %")).toBeInTheDocument();

    // Default shot count is 5 (DEFAULT_SHOTS in adc.tsx) — one <tbody> row per shot.
    expect(bodyRows()).toHaveLength(5);
  });

  it("changing the shot count changes the number of result rows", async () => {
    const user = userEvent.setup();
    await renderRoute("/adc");
    await selectAmmoAndArmor(user);
    await screen.findByText("First penetration");

    // A single `fireEvent.change` sets the exact value in one shot. Clearing then typing
    // digit-by-digit doesn't work here: on an empty string the field's onChange clamps to
    // `Math.max(1, ...)` rather than passing 0 through, so it redisplays "1" mid-clear and
    // the next keystroke types "3" onto that "1" instead of replacing it.
    const shotsInput = screen.getByLabelText("Shots");
    fireEvent.change(shotsInput, { target: { value: "3" } });

    await waitFor(() => expect(bodyRows()).toHaveLength(3));
  });

  it("shows the selected armor's max durability as the starting-durability placeholder, and an override clamps final durability", async () => {
    const user = userEvent.setup();
    await renderRoute("/adc");
    await selectAmmoAndArmor(user);
    await screen.findByText("First penetration");

    const durabilityInput = screen.getByLabelText(/Starting durability/);
    // armor-6b13's fixture durability is 80 — see apps/web/src/test/fixtures.ts.
    expect(durabilityInput).toHaveAttribute("placeholder", "80");

    await user.type(durabilityInput, "10");

    // Durability only ever goes down across a burst, so starting at 10 (well below the
    // fixture's 80 max) must clamp the "Final durability" stat to <= 10.
    const finalDurabilityDt = await screen.findByText("Final durability");
    const finalDurabilityDd = finalDurabilityDt.nextElementSibling;
    expect(finalDurabilityDd).not.toBeNull();
    const match = /^([\d.]+) \/ 80$/.exec(finalDurabilityDd!.textContent ?? "");
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(10);
  });

  it("shows an error card when the items resource fails to load", async () => {
    await renderRoute("/adc", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
