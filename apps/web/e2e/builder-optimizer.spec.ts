import type { Page } from "@playwright/test";
import { test, expect, OPTIMIZER_CHANGED_SLOTS } from "./upstream.js";

/**
 * End-to-end coverage for the optimizer-first view.
 *
 * Runs against the captured upstream document (see `upstream.ts`), so the solver's output is
 * fixed rather than whatever upstream shipped that morning. The `test.skip("no improvements
 * in this solver run")` escape hatch these tests used to carry is gone with it: on this data
 * the solver always changes {@link OPTIMIZER_CHANGED_SLOTS} slots, and a run that changes
 * nothing is now a failure rather than a silent pass.
 */

async function pickFirstWeapon(page: Page): Promise<string | null> {
  // Several <select> elements render on /builder (profile trader-LL selects in
  // a collapsed <details> above). Filter to the one with the "Select weapon"
  // option so we hit the real weapon picker.
  const picker = page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => await picker.locator("option").count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  const value = await picker.locator("option").nth(1).getAttribute("value");
  if (!value) return null;
  await picker.selectOption(value);
  return value;
}

test.describe("builder optimizer diff view", () => {
  test("enter view, run, toggle a row, accept-selected merges correctly", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).toBeVisible();
    await expect(page.getByText(/RUN THE SOLVER/i)).toBeVisible();

    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    const changedRows = page.locator('[aria-label^="Accept "]');
    await expect
      .poll(async () => await changedRows.count(), { timeout: 15_000 })
      .toBe(OPTIMIZER_CHANGED_SLOTS);

    const acceptSelected = page.getByRole("button", { name: /ACCEPT SELECTED/ });
    const beforeLabel = await acceptSelected.textContent();
    const beforeN = parseInt((beforeLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    // Every changed row starts selected, so the counter is the row count until one is toggled.
    expect(beforeN).toBe(OPTIMIZER_CHANGED_SLOTS);

    await changedRows.first().click();
    const afterLabel = await acceptSelected.textContent();
    const afterN = parseInt((afterLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    expect(afterN).toBe(beforeN - 1);

    await acceptSelected.click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
  });

  test("← EDITOR discards and returns to editor without merging", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);

    await page.getByRole("button", { name: /Back to builder editor/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).not.toBeVisible();
  });
});
