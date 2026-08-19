// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

describe("/sim", () => {
  it("populates the helmet and body-armor selects from the correct zone-filtered fixture armor", async () => {
    await renderRoute("/sim");

    const helmetSelect = await screen.findByLabelText(/Helmet \(optional\)/);
    const bodyArmorSelect = screen.getByLabelText(/Body armor \(optional\)/);
    await waitFor(() => expect(helmetSelect).not.toBeDisabled());

    // armor-altyn (zone "Head") belongs in the helmet select, NOT the body-armor one.
    expect(within(helmetSelect).getByText("Altyn helmet")).toBeInTheDocument();
    expect(within(helmetSelect).queryByText("6B13 assault armor (M)")).not.toBeInTheDocument();

    // armor-6b13 (zones "Chest"/"Stomach") belongs in the body-armor select, NOT the helmet one.
    expect(within(bodyArmorSelect).getByText("6B13 assault armor (M)")).toBeInTheDocument();
    expect(within(bodyArmorSelect).queryByText("Altyn helmet")).not.toBeInTheDocument();

    // No ammo selected yet — Run is disabled, and the results panel shows the empty state.
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText("No results yet.")).toBeInTheDocument();
  });

  it("queues a shot from the body silhouette and shows it in the shot queue", async () => {
    const user = userEvent.setup();
    await renderRoute("/sim");

    await waitFor(() => expect(screen.getByLabelText(/Helmet \(optional\)/)).not.toBeDisabled());

    expect(
      screen.getByText("Click a zone on the silhouette to add shots to your plan."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Thorax shot" }));

    // "Thorax" itself renders in both the silhouette button and the new queue row, so assert
    // on the queue row's distance text (unique on the page) instead of the ambiguous label.
    expect(
      screen.queryByText("Click a zone on the silhouette to add shots to your plan."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("15m")).toBeInTheDocument();

    // Clear empties the plan again.
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(
      screen.getByText("Click a zone on the silhouette to add shots to your plan."),
    ).toBeInTheDocument();
  });

  it("runs a scenario against ammo + helmet + body armor and renders the outcome and shot timeline", async () => {
    const user = userEvent.setup();
    await renderRoute("/sim");

    const ammoSelect = await screen.findByLabelText("Ammo");
    await waitFor(() => expect(ammoSelect).not.toBeDisabled());

    await user.selectOptions(ammoSelect, "ammo-m855");
    await user.selectOptions(screen.getByLabelText(/Helmet \(optional\)/), "armor-altyn");
    await user.selectOptions(screen.getByLabelText(/Body armor \(optional\)/), "armor-6b13");

    // Ammo alone is enough to enable Run.
    const runButton = screen.getByRole("button", { name: "Run" });
    expect(runButton).toBeEnabled();

    // Limb shots, not head/thorax: `simulateScenario` stops the walk the moment head or
    // thorax HP hits 0, so a lethal head shot would leave only 1 shot fired instead of 2 —
    // limbs keep this test's shot count deterministic regardless of ammo/armor lethality.
    await user.click(screen.getByRole("button", { name: "Add L. Arm shot" }));
    await user.click(screen.getByRole("button", { name: "Add R. Arm shot" }));
    await user.click(runButton);

    // ScenarioSummary renders a real outcome (Alive or Killed) and a shot count.
    expect(await screen.findByText("OUTCOME")).toBeInTheDocument();
    expect(screen.getByText(/Alive|Killed/)).toBeInTheDocument();
    const shotsFiredStat = screen.getByText("SHOTS FIRED").parentElement;
    expect(shotsFiredStat).not.toBeNull();
    expect(shotsFiredStat).toHaveTextContent("2");

    // ShotTimeline renders one row per shot, each with a real PEN/blocked pill. ("Head" and
    // "Thorax" text is ambiguous here — it renders in both the silhouette buttons and the
    // still-populated ShotQueue rows above the results — so the pill count is the reliable
    // signal that two timeline rows rendered.)
    expect(screen.queryByText("No shots executed.")).not.toBeInTheDocument();
    const pens = screen.getAllByText(/^(PEN|blocked)$/);
    expect(pens).toHaveLength(2);
  });

  it("shows an error card when the items resource fails to load", async () => {
    await renderRoute("/sim", { client: createTestClient({ errorResources: ["items"] }) });
    expect(await screen.findByText(/Failed to load data:/)).toBeInTheDocument();
  });
});
