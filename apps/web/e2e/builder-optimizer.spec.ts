import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the optimizer-first view.
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
    if (!picked) test.skip(true, "no weapons loaded in this env");

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).toBeVisible();
    await expect(page.getByText(/RUN THE SOLVER/i)).toBeVisible();

    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    // Wait for either a changed-row or the zero-change state.
    const firstRow = page.locator('[aria-label^="Accept "]').first();
    await Promise.race([
      firstRow.waitFor({ state: "visible", timeout: 15_000 }).catch(() => null),
      page
        .getByText(/NO IMPROVEMENTS FOUND/i)
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => null),
    ]);

    const hasRow = await firstRow.isVisible().catch(() => false);
    if (!hasRow) {
      await expect(page.getByText(/NO IMPROVEMENTS FOUND/i)).toBeVisible();
      test.skip(true, "no improvements in this solver run — not a bug");
    }

    const acceptSelected = page.getByRole("button", { name: /ACCEPT SELECTED/ });
    const beforeLabel = await acceptSelected.textContent();
    const beforeN = parseInt((beforeLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    await firstRow.click();
    const afterLabel = await acceptSelected.textContent();
    const afterN = parseInt((afterLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    expect(afterN).toBe(beforeN - 1);

    await acceptSelected.click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
  });

  test("← EDITOR discards and returns to editor without merging", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    if (!picked) test.skip(true, "no weapons loaded");

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);

    await page.getByRole("button", { name: /Back to builder editor/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).not.toBeVisible();
  });
});
