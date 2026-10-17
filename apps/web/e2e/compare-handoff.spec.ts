import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { openProgression, pickWeapon, progressionPanel, weaponPicker } from "./builder-helpers.js";

/**
 * Handing a build from the Builder to Compare (#258): in progression the Builder's profile
 * goes with it, so Compare prices and gates both sides as the Builder showed the build. A
 * theorycraft handoff stays ungated.
 */

// The profile is set in the test, through the one-click LL2 the Builder offers.
test.use({ playerProfile: "fresh" });

/** Peacekeeper LL3 only in the captures: open in theorycraft, locked on LL2 (see builder-mode). */
const ELCAN = /^ELCAN SpecterDR 1x\/4x scope(?! \()/;

/** The ELCAN option in the receiver scope slot under `root`, the slot opened. */
async function elcanOption(root: Locator) {
  await root.locator('details[data-slot-path="mod_reciever"] > summary').first().click();
  const slot = root.locator('details[data-slot-path="mod_reciever/mod_scope"]').first();
  await slot.locator(":scope > summary").click();
  return slot.getByRole("button", { name: ELCAN });
}

/** Pick the M4A1 in the Builder and return its cost line once prices are in. */
async function builderCost(page: Page): Promise<string> {
  await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
  await pickWeapon(page);
  const cost = page.getByTestId("build-cost").locator("dd").first();
  await expect(cost).toBeVisible({ timeout: 15_000 });
  return (await cost.textContent()) ?? "";
}

async function handOffBothSides(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Compare this build" })
    .getByRole("button", { name: "Compare", exact: true })
    .click();
  await expect(page).toHaveURL(/\/builder\/compare$/);
}

/** Side A's card: the one holding its weapon picker. */
function sideA(page: Page): Locator {
  return page.locator("div.relative.z-10", { has: page.locator("#compare-weapon-A") });
}

test.describe("Compare handoff", () => {
  test("in progression, both sides show the Builder's price and lock state", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await openProgression(page);
    await progressionPanel(page).getByRole("button", { name: "LL2", exact: true }).click();

    const cost = await builderCost(page);
    expect(cost).toMatch(/^₽/);
    await expect((await elcanOption(page.locator("body"))).getByText("Locked")).toBeVisible();

    await handOffBothSides(page);
    const row = page.getByTestId("compare-price-row");
    await expect(row.getByText(cost, { exact: true })).toHaveCount(2, { timeout: 15_000 });
    await expect(row.getByText("Reachable")).toHaveCount(2);
    await expect((await elcanOption(sideA(page))).getByText("Locked")).toBeVisible();
  });

  test("in theorycraft, the handed-off sides stay ungated", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const cost = await builderCost(page);

    await handOffBothSides(page);
    const row = page.getByTestId("compare-price-row");
    await expect(row.getByText(cost, { exact: true })).toHaveCount(2, { timeout: 15_000 });
    await expect(row.getByText("Reachable")).toHaveCount(0);
    const elcan = await elcanOption(sideA(page));
    await expect(elcan).toBeVisible();
    await expect(elcan.getByText("Locked")).toHaveCount(0);
  });
});
