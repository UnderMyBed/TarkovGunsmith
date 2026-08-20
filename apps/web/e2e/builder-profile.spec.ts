import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * End-to-end coverage for the PMC level control on the progression profile.
 *
 * The level is what makes flea-market gating real: 778 of 1,638 live mods carry a
 * `minLevelForFlea` that was parsed and then ignored before this control existed. These
 * tests protect the three things that can silently break — the control edits the profile,
 * the profile survives a reload, and out-of-range input is clamped rather than persisted.
 */

// The rest of the suite seeds a progressed profile so the captured weapons are reachable in
// the Builder's picker. This file's subject is the *unseeded* state — "a fresh profile starts
// at level 1" is the first thing it asserts — so it opts out and starts from DEFAULT_PROFILE.
test.use({ playerProfile: "fresh" });

/** The editor lives behind a <details> that is collapsed on first paint. */
async function openProfileEditor(page: Page): Promise<void> {
  const summary = page.getByText(/^(Edit profile|Override manually)/);
  await expect(summary).toBeVisible({ timeout: 15_000 });
  await summary.click();
}

function levelInput(page: Page) {
  return page.locator("label").filter({ hasText: "PMC level" }).locator("input");
}

function fleaCheckbox(page: Page) {
  return page.locator("label").filter({ hasText: "Flea market access" }).locator("input");
}

test.describe("builder progression profile — PMC level", () => {
  test("edits the level, drives the flea hint, and survives a reload", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await openProfileEditor(page);

    const level = levelInput(page);
    await expect(level).toBeVisible();
    // DEFAULT_PROFILE is restrictive: a fresh profile starts at level 1.
    await expect(level).toHaveValue("1");

    // The hint only renders with flea access on — that is the only state where the
    // level actually gates anything.
    await fleaCheckbox(page).check();
    await expect(page.getByText(/level requirement above 1 stay locked/i)).toBeVisible();

    await level.fill("25");
    await level.blur();
    await expect(page.getByText(/level requirement above 25 stay locked/i)).toBeVisible();

    // The profile is persisted to localStorage; a reload must not reset it. This is the
    // regression that would silently wipe a stored profile.
    await page.reload({ waitUntil: "networkidle" });
    await openProfileEditor(page);
    await expect(levelInput(page)).toHaveValue("25");
    await expect(fleaCheckbox(page)).toBeChecked();
  });

  test("clamps out-of-range input to the schema bounds", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await openProfileEditor(page);

    const level = levelInput(page);
    await expect(level).toBeVisible();

    // Above the schema max: PlayerProfile caps at 99, so a larger value must never reach
    // the profile — an out-of-range level would fail to parse on the next rehydrate.
    await level.fill("150");
    await level.blur();
    await expect(level).toHaveValue("99");

    // Below the schema min.
    await level.fill("0");
    await level.blur();
    await expect(level).toHaveValue("1");
  });
});
