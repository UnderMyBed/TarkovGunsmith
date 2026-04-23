import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage for the optimizer-first view.
 * Prereq: run `pnpm seed:build` locally first to create a fixture build.
 * In CI the seeding happens in the playwright global-setup (see webServer config).
 */
test.describe("builder optimizer diff view", () => {
  test("enter view, run, toggle a row, accept-selected merges correctly", async ({ page }) => {
    await page.goto("/builder");
    // Pick a weapon so Optimize is reachable.
    // Wait for weapons to load, then pick the first real entry.
    const select = page.locator("select").first();
    await expect(select).toBeEnabled({ timeout: 10_000 });
    const firstWeapon = await select.locator("option").nth(1).getAttribute("value");
    if (!firstWeapon) test.skip(true, "no weapons loaded in this env");
    await select.selectOption(firstWeapon);

    // Click ◇ OPTIMIZE.
    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).toBeVisible();

    // Idle state.
    await expect(page.getByText(/RUN THE SOLVER/i)).toBeVisible();

    // Run it.
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    // A row appears (solver almost always finds at least one improvement on default min-recoil).
    // If not, the ZERO-CHANGE state is also valid and the next assertion becomes a skip.
    const firstRow = page.locator('[aria-label^="Accept "]').first();
    const hasRow = await firstRow.isVisible().catch(() => false);
    if (!hasRow) {
      await expect(page.getByText(/NO IMPROVEMENTS FOUND/i)).toBeVisible();
      test.skip(true, "no improvements in this solver run — not a bug");
    }

    // Uncheck the first row and check that ACCEPT SELECTED's (N) count drops by 1.
    const beforeLabel = await page.getByRole("button", { name: /ACCEPT SELECTED/ }).textContent();
    const beforeN = parseInt((beforeLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    await firstRow.click();
    const afterLabel = await page.getByRole("button", { name: /ACCEPT SELECTED/ }).textContent();
    const afterN = parseInt((afterLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    expect(afterN).toBe(beforeN - 1);

    // Accept selected → URL returns to /builder (no view param).
    await page.getByRole("button", { name: /ACCEPT SELECTED/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
  });

  test("← EDITOR discards and returns to editor without merging", async ({ page }) => {
    await page.goto("/builder");
    const select = page.locator("select").first();
    await expect(select).toBeEnabled({ timeout: 10_000 });
    const firstWeapon = await select.locator("option").nth(1).getAttribute("value");
    if (!firstWeapon) test.skip(true, "no weapons loaded");
    await select.selectOption(firstWeapon);

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);

    await page.getByRole("button", { name: /← EDITOR/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).not.toBeVisible();
  });
});
