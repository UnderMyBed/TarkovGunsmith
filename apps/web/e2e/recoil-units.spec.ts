import type { Page } from "@playwright/test";
import {
  test,
  expect,
  OPTIMIZER_CHANGED_SLOTS,
  STRONGEST_OPTIMIZED_RECOIL_CELL,
} from "./upstream.js";

/**
 * Guards the recoil unit contract end-to-end against the captured upstream document.
 *
 * Upstream ships `recoilModifier` as a fraction (-0.35..0). The app treated it
 * as a percent and divided by 100, so every recoil number was 100x too small —
 * mods appeared to do nothing. See docs/operations/data-api-audit.md §B.
 *
 * The Builder test below fails against the pre-fix code: the delta badge was suppressed
 * entirely because a real -49.5% build computed as -0.495%, under
 * `formatPercent`'s 0.5% floor.
 *
 * These ran against LIVE upstream until issue #175 — which meant the numbers below were
 * whatever the day's document happened to contain, and the only assertions that could be
 * written were loose ranges plus a `test.skip` for "the solver found nothing today". With the
 * captures served by `upstream.ts` the figures are exact, so they are asserted exactly, and
 * the skips are gone: on this data the solver always has work to do.
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
  await startEmpty(page);
  return value;
}

/** New builds start from the weapon's default preset; these tests build from an empty weapon. */
async function startEmpty(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Presets" })
    .getByRole("button", { name: /^Empty/ })
    .click();
  await expect(page.getByText("0 attached", { exact: true })).toBeVisible();
}

test.describe("recoil is expressed as a percentage", () => {
  test("Builder shows a non-blank recoil delta once mods are attached", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    // Drive the optimizer rather than hand-clicking slots: min-recoil is its
    // default objective, so whatever it accepts is a genuine reduction.
    await page.getByRole("button", { name: /◇ Optimize/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await page.getByRole("button", { name: /Re-run optimization/i }).click();

    const changedRows = page.locator('[aria-label^="Accept "]');
    await expect
      .poll(async () => await changedRows.count(), { timeout: 20_000 })
      .toBe(OPTIMIZER_CHANGED_SLOTS);

    // The RCL % column must show a real percentage. Pre-fix it rendered "−0" on every row,
    // because a fraction hit a zero-decimal formatter. The strongest proposed mod is a
    // -0.24 fraction, so the cell has to read exactly -24.0 percent — one assertion covering
    // both the unit and the scale. Less recoil is an improvement, so the cell also carries
    // the screen-reader "better" that keeps the direction from resting on colour alone.
    const deltaCells = page.locator("span.text-right.font-mono.text-xs");
    await expect
      .poll(async () => await deltaCells.allTextContents(), { timeout: 10_000 })
      .toContain(`${STRONGEST_OPTIMIZED_RECOIL_CELL} better`);

    await page.getByRole("button", { name: /Accept all/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);

    // BuildHeader's Recoil V / Recoil H delta badges. `formatPercent` blanks
    // anything under 0.5%, which is exactly what the 100x error produced.
    await expect
      .poll(
        async () => {
          const texts = await page.locator("div.font-mono").allTextContents();
          return texts.filter((t) => /^[−+]\d+%( better| worse)?$/.test(t.trim())).length;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });
});
