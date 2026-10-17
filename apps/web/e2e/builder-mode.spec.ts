import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { fixtureBuildableWeaponCount } from "./upstream-fixtures.js";

/**
 * The Builder's mode (#241): a first visit is theorycraft, with every weapon open and a prompt
 * to set a progression; setting one switches to progression, which a reload keeps; and the
 * switch back to theorycraft is kept too.
 */

// This file's subject is the first visit, so nothing is seeded.
test.use({ playerProfile: "fresh" });

/**
 * In the captures only Peacekeeper sells the ELCAN SpecterDR, for cash at LL3, and the M4A1's
 * default preset (Carbine) mounts an upper receiver whose scope slot takes it: open in
 * theorycraft, locked on an LL2 profile. The captures' three weapons are all within LL2's
 * reach, so the parts, not the weapon list, show the gate. (The Carbine's charging handle
 * also clashes with it, so it is disabled either way; the pill is what changes. Its FDE twin
 * is named "… scope (FDE)", hence the lookahead.)
 */
const ELCAN = /^ELCAN SpecterDR 1x\/4x scope(?! \()/;

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

/** The ELCAN option in the M4A1's receiver scope slot, the slot opened. */
async function elcanOption(page: Page) {
  await page.locator('details[data-slot-path="mod_reciever"] > summary').click();
  const slot = page.locator('details[data-slot-path="mod_reciever/mod_scope"]');
  await slot.locator(":scope > summary").click();
  return slot.getByRole("button", { name: ELCAN });
}

async function pickM4A1(page: Page): Promise<void> {
  await weaponPicker(page).selectOption({ label: "Colt M4A1 5.56x45 assault rifle" });
  await expect(page.locator('details[data-slot-path="mod_reciever"]')).toBeVisible();
}

const modeButton = (page: Page, name: "Theorycraft" | "Progression") =>
  page.getByRole("group", { name: "Builder mode" }).getByRole("button", { name });

test.describe("Builder mode", () => {
  test("a first visit is theorycraft, with every weapon and the progression prompt", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });

    await expect(page.getByText("Set your progression")).toBeVisible();
    await expect(modeButton(page, "Theorycraft")).toHaveAttribute("aria-pressed", "true");
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      await expect(page.getByRole("button", { name: ll, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Import from TarkovTracker/ })).toBeVisible();

    const all = fixtureBuildableWeaponCount();
    await expect(page.getByText(`${all} weapons`, { exact: true })).toBeVisible();
    // The placeholder plus one option per weapon, none of them locked.
    await expect(weaponPicker(page).locator("option")).toHaveCount(all + 1);
    await expect(weaponPicker(page).locator("option", { hasText: "LOCKED" })).toHaveCount(0);

    await pickM4A1(page);
    const elcan = await elcanOption(page);
    await expect(elcan).toBeVisible();
    await expect(elcan.getByText("LOCKED")).toHaveCount(0);
  });

  test("LL2 switches to progression, and a reload stays there", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });

    await page.getByRole("button", { name: "LL2", exact: true }).click();

    const gated = page.getByText(
      `${fixtureBuildableWeaponCount()} weapons available on your profile`,
      {
        exact: true,
      },
    );
    await expect(gated).toBeVisible();
    await expect(page.getByText("Set your progression")).toHaveCount(0);
    await expect(modeButton(page, "Progression")).toHaveAttribute("aria-pressed", "true");
    await pickM4A1(page);
    await expect((await elcanOption(page)).getByText("LOCKED")).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(gated).toBeVisible({ timeout: 15_000 });
    await expect(modeButton(page, "Progression")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Set your progression")).toHaveCount(0);
    // The reload restores the build from its draft; the part stays locked under LL2.
    await expect((await elcanOption(page)).getByText("LOCKED")).toBeVisible();
  });

  test("switching back to theorycraft is kept across a reload, and so is the profile", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "LL2", exact: true }).click();
    await expect(modeButton(page, "Progression")).toHaveAttribute("aria-pressed", "true");

    await modeButton(page, "Theorycraft").click();
    const all = page.getByText(`${fixtureBuildableWeaponCount()} weapons`, { exact: true });
    await expect(all).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(all).toBeVisible({ timeout: 15_000 });
    await expect(modeButton(page, "Theorycraft")).toHaveAttribute("aria-pressed", "true");

    // The LL2 profile is still there to switch back to.
    await modeButton(page, "Progression").click();
    await expect(
      page.getByText(`${fixtureBuildableWeaponCount()} weapons available on your profile`, {
        exact: true,
      }),
    ).toBeVisible();
  });
});
