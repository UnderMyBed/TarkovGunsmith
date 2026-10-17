import type { ConsoleMessage, Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { fixturePresetPartCount } from "./upstream-fixtures.js";

/**
 * The in-progress build survives a reload (#221): `/builder` keeps it in `tg:builder-draft`,
 * and edits to a shared build are kept per id. No spec here shares a build: the shared one is
 * served by `page.route`, never by KV.
 */

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_LABEL = "Colt M4A1 5.56x45 assault rifle";
const CARBINE = "5af08cf886f774223c269184";
const DRAFT_KEY = "tg:builder-draft";
let CARBINE_PARTS: number;

test.beforeAll(async () => {
  CARBINE_PARTS = await fixturePresetPartCount(M4A1, CARBINE);
});

function attached(page: Page, count: number) {
  return page.getByText(`${count} attached`, { exact: true });
}

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test.describe("Builder draft", () => {
  test("a reload restores the build, and New build clears it", async ({ page }) => {
    const errors = consoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });
    await expect(attached(page, CARBINE_PARTS)).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("Build name (optional)").fill("Night raid");

    await page.reload({ waitUntil: "networkidle" });
    await expect(attached(page, CARBINE_PARTS)).toBeVisible({ timeout: 15_000 });
    await expect(weaponPicker(page)).toHaveValue(M4A1);
    await expect(page.getByPlaceholder("Build name (optional)")).toHaveValue("Night raid");

    await page.getByRole("button", { name: "New build" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByText("NO WEAPON SELECTED")).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText("NO WEAPON SELECTED")).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
    expect(errors).toEqual([]);
  });

  test("a corrupt draft gives an empty builder without a console error", async ({ page }) => {
    const errors = consoleErrors(page);
    await page.addInitScript((key) => localStorage.setItem(key, "{not a draft"), DRAFT_KEY);
    await page.goto("/builder", { waitUntil: "networkidle" });

    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText("NO WEAPON SELECTED")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("edits to a shared build survive a reload, and Revert restores the shared build", async ({
    page,
  }) => {
    const errors = consoleErrors(page);
    await page.route("**/api/builds/abcd2348", (route) =>
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
    await page.goto("/builder/abcd2348", { waitUntil: "networkidle" });
    const presets = page.getByRole("group", { name: "Presets" });
    await expect(presets.getByRole("button", { name: /^Empty/ })).toBeVisible({ timeout: 15_000 });
    await expect(attached(page, 2)).toBeVisible();

    await presets.getByRole("button", { name: /^Empty/ }).click();
    await page.getByRole("button", { name: "Replace" }).click();
    await expect(attached(page, 0)).toBeVisible();
    await expect(page.getByText("Edited from the shared build")).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Edited from the shared build")).toBeVisible({ timeout: 15_000 });
    await expect(attached(page, 0)).toBeVisible();

    await page.getByRole("button", { name: "Revert" }).click();
    await expect(attached(page, 2)).toBeVisible();
    await expect(page.getByText("Edited from the shared build")).toHaveCount(0);
    // The /builder draft is a separate build, never written from here.
    expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
    expect(errors).toEqual([]);
  });
});
