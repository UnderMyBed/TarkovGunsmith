import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * New builds start from the weapon's default preset (#216), placed from upstream's own preset
 * into the slot graph. The counts are the captured presets' parts, each fitted in a visible
 * slot: the M4A1 "Carbine" default lists 12 parts and the "SOPMOD II" 19.
 */

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_LABEL = "Colt M4A1 5.56x45 assault rifle";
const CARBINE_PARTS = 12;
const SOPMOD_PARTS = 19;

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

function presets(page: Page) {
  return page.getByRole("group", { name: "Presets" });
}

function chip(page: Page, name: RegExp) {
  return presets(page).getByRole("button", { name });
}

test.describe("Builder presets", () => {
  test("selecting a weapon starts from its default preset", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });

    await expect(page.getByText(`${CARBINE_PARTS} attached`)).toBeVisible({ timeout: 15_000 });
    await expect(chip(page, /^M4A1 Carbine/)).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('details[data-slot-path="mod_reciever/mod_barrel"] > summary'),
    ).toContainText("14.5 inch barrel");
  });

  test("Empty clears the weapon, and a preset applies in one click", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });
    await expect(page.getByText(`${CARBINE_PARTS} attached`)).toBeVisible({ timeout: 15_000 });

    await chip(page, /^Empty/).click();
    await expect(page.getByText("0 attached")).toBeVisible();
    await expect(chip(page, /^Empty/)).toHaveAttribute("aria-pressed", "true");

    await chip(page, /^M4A1 SOPMOD II/).click();
    await expect(page.getByText(`${SOPMOD_PARTS} attached`)).toBeVisible();
    await expect(chip(page, /^M4A1 SOPMOD II/)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("a loaded build keeps exactly the parts it was saved with", async ({ page }) => {
    await page.route("**/api/builds/abcd2347", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: 6,
          weaponId: M4A1,
          attachments: {
            mod_reciever: "55d355e64bdc2d962f8b4569",
            mod_pistol_grip: "55d4b9964bdc2d1d4e8b456e",
          },
          orphaned: [],
          createdAt: "2026-10-16T00:00:00.000Z",
        }),
      }),
    );
    await page.goto("/builder/abcd2347", { waitUntil: "networkidle" });

    await expect(page.getByText("2 attached")).toBeVisible({ timeout: 15_000 });
    // It matches no preset, so nothing is marked current.
    await expect(presets(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  });

  test("a Compare side starts from the default preset", async ({ page }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });
    const left = page.locator("#compare-weapon-A");
    await expect(left.locator(`option[value="${M4A1}"]`)).toHaveCount(1, { timeout: 15_000 });
    await left.selectOption(M4A1);

    await expect(page.getByText(`${CARBINE_PARTS} attached`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("group", { name: "Presets" })).toHaveCount(0);
  });
});
