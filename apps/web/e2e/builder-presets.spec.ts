import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { fixturePresetPartCount } from "./upstream-fixtures.js";
import {
  choosePreset,
  expectPreset,
  pickWeapon,
  presetSelect,
  slotRow,
} from "./builder-helpers.js";

/**
 * New builds start from the weapon's default preset (#216), placed from upstream's own preset
 * into the slot graph. The expected counts are the captured presets' parts in visible slots,
 * read from the generated snapshot rather than restated here.
 */

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const CARBINE = "5af08cf886f774223c269184";
const SOPMOD = "5a8ae73886f7747b2e6e1416";
let CARBINE_PARTS: number;
let SOPMOD_PARTS: number;

test.beforeAll(async () => {
  CARBINE_PARTS = await fixturePresetPartCount(M4A1, CARBINE);
  SOPMOD_PARTS = await fixturePresetPartCount(M4A1, SOPMOD);
});

function attached(page: Page, count: number) {
  return page.getByText(`${count} attached`, { exact: true });
}

test.describe("Builder presets", () => {
  test("selecting a weapon starts from its default preset", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);

    await expect(attached(page, CARBINE_PARTS)).toBeVisible({ timeout: 15_000 });
    await expectPreset(page, /^M4A1 Carbine/);
    await expect(slotRow(page, "mod_reciever/mod_barrel")).toContainText("14.5 inch barrel");
  });

  test("Empty clears the weapon, and a preset applies in one click", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expect(attached(page, CARBINE_PARTS)).toBeVisible({ timeout: 15_000 });

    await choosePreset(page, /^Empty/);
    await expect(attached(page, 0)).toBeVisible();
    await expectPreset(page, /^Empty/);

    await choosePreset(page, /^M4A1 SOPMOD II/);
    await expect(attached(page, SOPMOD_PARTS)).toBeVisible();
    await expectPreset(page, /^M4A1 SOPMOD II/);
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

    // Wait for the presets, so a seeding regression has had its chance to run.
    await expect(presetSelect(page)).toBeVisible({ timeout: 15_000 });
    await expect(attached(page, 2)).toBeVisible();
    // It matches no preset, so no preset is current: the dropdown reads "Custom parts".
    await expectPreset(page, /^Custom parts$/);
  });

  test("a Compare side starts from the default preset", async ({ page }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });
    const left = page.locator("#compare-weapon-A");
    await expect(left.locator(`option[value="${M4A1}"]`)).toHaveCount(1, { timeout: 15_000 });
    await left.selectOption(M4A1);

    await expect(attached(page, CARBINE_PARTS)).toBeVisible({ timeout: 15_000 });
    await expect(presetSelect(page)).toHaveCount(0);
  });
});
