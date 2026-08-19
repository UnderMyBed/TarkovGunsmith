// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

async function selectArmor(user: ReturnType<typeof userEvent.setup>) {
  const armorSelect = await screen.findByLabelText("Armor");
  // `findByLabelText` resolves as soon as the <select> exists, before useAmmoList/
  // useArmorList settle — it starts disabled with only "Loading…".
  await waitFor(() => expect(armorSelect).not.toBeDisabled());
  await user.selectOptions(armorSelect, "armor-6b13");
}

function bodyRows(): HTMLTableRowElement[] {
  const table = screen.getByRole("table");
  return Array.from(table.querySelectorAll("tbody tr"));
}

describe("/aec", () => {
  it("shows the picker prompt before an armor is selected", async () => {
    await renderRoute("/aec");
    const armorSelect = await screen.findByLabelText("Armor");
    // The prompt is gated on `!isLoading` too, so wait for data to actually settle.
    await waitFor(() => expect(armorSelect).not.toBeDisabled());
    expect(screen.getByText("Pick an armor to rank every ammo.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("ranks every fixture ammo against the selected armor, each with a classification pill", async () => {
    const user = userEvent.setup();
    await renderRoute("/aec");
    await selectArmor(user);

    // Two fixture ammo types (M855, M995) — see apps/web/src/test/fixtures.ts — so one
    // ranked row each once armor-6b13 is picked.
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const rows = bodyRows();

    const rowText = rows.map((r) => r.textContent ?? "").join("\n");
    expect(rowText).toContain("5.56x45mm M855");
    expect(rowText).toContain("5.56x45mm M995");

    for (const row of rows) {
      const pill = row.querySelector("td:last-child");
      expect(pill).not.toBeNull();
      // `rankAmmos` classifies as one of these three — which one depends on the real
      // ballistics simulation against the fixture ammo/armor, not asserted here since
      // that math is `packages/ballistics`'s concern.
      expect(["reliable", "marginal", "ineffective"]).toContain(pill!.textContent);
    }
  });

  it("recomputes the ranking (same row count) when shot cap or distance change", async () => {
    const user = userEvent.setup();
    await renderRoute("/aec");
    await selectArmor(user);
    await waitFor(() => expect(bodyRows()).toHaveLength(2));

    // `fireEvent.change` sets the exact value in one shot — clearing then typing
    // digit-by-digit misbehaves here because the field's onChange clamps an empty string to
    // `Math.max(1, ...)` instead of passing 0 through, so the field redisplays "1" mid-clear
    // and the next keystroke types onto that "1" instead of replacing it.
    const shotCapInput = screen.getByLabelText("Shot cap");
    fireEvent.change(shotCapInput, { target: { value: "5" } });
    await waitFor(() => expect(bodyRows()).toHaveLength(2));

    const distanceInput = screen.getByLabelText(/Distance \(m\)/);
    fireEvent.change(distanceInput, { target: { value: "80" } });
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
  });

  it("shows an error card when the items resource fails to load", async () => {
    await renderRoute("/aec", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
