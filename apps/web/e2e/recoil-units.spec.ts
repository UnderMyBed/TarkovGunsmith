import { test, expect, type Page } from "@playwright/test";

/**
 * Guards the recoil unit contract end-to-end against live upstream data.
 *
 * Upstream ships `recoilModifier` as a fraction (-0.35..0). The app treated it
 * as a percent and divided by 100, so every recoil number was 100x too small —
 * mods appeared to do nothing. See docs/operations/data-api-audit.md §B.
 *
 * Both tests below fail against the pre-fix code: the /data column rendered raw
 * fractions under a "%" header, and the Builder's delta badge was suppressed
 * entirely because a real -49.5% build computed as -0.495%, under
 * `formatPercent`'s 0.5% floor.
 */

async function pickFirstWeapon(page: Page): Promise<string | null> {
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

test.describe("recoil is expressed as a percentage", () => {
  test("/data Modules renders Recoil % on a percent scale, not raw fractions", async ({ page }) => {
    await page.goto("/data", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "MODULES", exact: true }).click();

    const rows = page.locator("table tbody tr");
    await expect.poll(async () => await rows.count(), { timeout: 20_000 }).toBeGreaterThan(50);

    // Column order: Name, Ergo Δ, Recoil %, Accuracy %, Weight.
    const recoilCells = await rows.locator("td:nth-child(3)").allTextContents();
    const values = recoilCells.map((t) => Number.parseFloat(t)).filter((n) => Number.isFinite(n));
    expect(values.length).toBeGreaterThan(50);

    // Live mods bottom out at -0.35 as a fraction, i.e. -35 as a percent. If
    // the raw fraction leaked through, nothing here could clear -1.
    const strongest = Math.min(...values);
    expect(strongest).toBeLessThanOrEqual(-15);
    // And the scale must be plausible — a second, undetected 100x would show up
    // here as values past -100%.
    expect(strongest).toBeGreaterThan(-100);
  });

  test("Builder shows a non-blank recoil delta once mods are attached", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    if (!picked) test.skip(true, "no weapons loaded in this env");

    // Drive the optimizer rather than hand-clicking slots: min-recoil is its
    // default objective, so whatever it accepts is a genuine reduction.
    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    const firstRow = page.locator('[aria-label^="Accept "]').first();
    await Promise.race([
      firstRow.waitFor({ state: "visible", timeout: 20_000 }).catch(() => null),
      page
        .getByText(/NO IMPROVEMENTS FOUND/i)
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => null),
    ]);
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.skip(true, "solver found no improvement for this weapon — not a bug");
    }

    // The RCL % column must show a real percentage. Pre-fix it rendered "−0"
    // on every row, because a fraction hit a zero-decimal formatter.
    const rclCells = page.locator("span.text-right.font-mono.text-xs");
    await expect
      .poll(async () => (await rclCells.allTextContents()).some((t) => /^[−+]\d+\.\d$/.test(t)), {
        timeout: 10_000,
      })
      .toBe(true);

    await page.getByRole("button", { name: /ACCEPT ALL/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);

    // BuildHeader's RECOIL V / RECOIL H delta badges. `formatPercent` blanks
    // anything under 0.5%, which is exactly what the 100x error produced.
    await expect
      .poll(
        async () => {
          const texts = await page.locator("div.font-mono").allTextContents();
          return texts.filter((t) => /^[−+]\d+%$/.test(t.trim())).length;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });
});
