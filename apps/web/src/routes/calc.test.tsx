// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

describe("/calc", () => {
  it("loads ammo + armor options and computes a shot on selection", async () => {
    const user = userEvent.setup();
    await renderRoute("/calc");

    // Fixture ammo/armor land once useAmmoList/useArmorList resolve.
    const ammoSelect = await screen.findByLabelText("Ammo");
    await waitFor(() => expect(screen.getByText("5.56x45mm M855")).toBeInTheDocument());

    // No result until both an ammo and an armor are picked.
    expect(screen.getByText("Pick an ammo and an armor to see the result.")).toBeInTheDocument();

    await user.selectOptions(ammoSelect, "ammo-m855");
    await user.selectOptions(screen.getByLabelText("Armor"), "armor-6b13");

    // `simulateShot` ran for real against the adapted fixture ammo/armor — assert the
    // matchup line (shortNames only appear here, not in the <option> list) rather than a
    // magic number, since the ballistics math itself is `packages/ballistics`'s concern
    // (covered + cross-checked there).
    expect(screen.getByText("Penetrated?")).toBeInTheDocument();
    expect(screen.getByText("Remaining durability")).toBeInTheDocument();
    const matchup = screen.getByText("Matchup").closest("div");
    expect(matchup).not.toBeNull();
    expect(matchup).toHaveTextContent("M855 vs 6B13 at 15m");
  });

  it("changing distance recomputes the result without re-selecting ammo/armor", async () => {
    const user = userEvent.setup();
    await renderRoute("/calc");

    const ammoSelect = await screen.findByLabelText("Ammo");
    // Wait for the fixture ammo to actually populate the <select> before interacting —
    // `findByLabelText` resolves as soon as the (disabled, "Loading…") element exists, which
    // is before `useAmmoList`/`useArmorList` have settled.
    await waitFor(() => expect(ammoSelect).not.toBeDisabled());
    await user.selectOptions(ammoSelect, "ammo-m855");
    await user.selectOptions(screen.getByLabelText("Armor"), "armor-6b13");
    await screen.findByText("Penetrated?");

    // The label wraps a helper caption too ("Distance does not affect..."), so its
    // accessible name isn't the exact string "Distance (m)" — match a substring instead.
    const distanceInput = screen.getByLabelText(/Distance \(m\)/);
    await user.clear(distanceInput);
    await user.type(distanceInput, "50");

    expect(await screen.findByText(/at 50m/)).toBeInTheDocument();
  });

  it("shows an error card when the items resource fails to load", async () => {
    await renderRoute("/calc", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
