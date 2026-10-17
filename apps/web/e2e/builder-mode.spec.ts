import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { fixtureBuildableWeaponCount } from "./upstream-fixtures.js";
import { openProgression, pickWeapon, progressionPanel, weaponPicker } from "./builder-helpers.js";

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

/**
 * The weapon count at the head of the picker's list, read with the list open: "N weapons" in
 * theorycraft, "N weapons available on your profile" in progression.
 */
async function expectWeaponCount(page: Page, text: string, timeout?: number): Promise<void> {
  await weaponPicker(page).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible(
    timeout === undefined ? undefined : { timeout },
  );
  await page.keyboard.press("Escape");
}

/** The ELCAN option in the M4A1's receiver scope slot, the slot opened. */
async function elcanOption(page: Page) {
  await page.locator('details[data-slot-path="mod_reciever"] > summary').click();
  const slot = page.locator('details[data-slot-path="mod_reciever/mod_scope"]');
  await slot.locator(":scope > summary").click();
  return slot.getByRole("button", { name: ELCAN });
}

async function pickM4A1(page: Page): Promise<void> {
  await pickWeapon(page);
  await expect(page.locator('details[data-slot-path="mod_reciever"]')).toBeVisible();
}

const modeButton = (page: Page, name: "Theorycraft" | "My progression…") =>
  page.getByRole("group", { name: "Builder mode" }).getByRole("button", { name });

test.describe("Builder mode", () => {
  test("a first visit is theorycraft, with every weapon and the progression prompt", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });

    // The prompt is on the page from the first paint, not behind the panel.
    await expect(page.getByText("Set your progression")).toBeVisible();
    await expect(modeButton(page, "Theorycraft")).toHaveAttribute("aria-pressed", "true");
    await openProgression(page);
    const panel = progressionPanel(page);
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      await expect(panel.getByRole("button", { name: ll, exact: true })).toBeVisible();
    }
    await expect(panel.getByRole("button", { name: /Import from TarkovTracker/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    const all = fixtureBuildableWeaponCount();
    await expectWeaponCount(page, `${all} weapons`);
    // One option per weapon, none of them locked.
    await weaponPicker(page).click();
    await expect(page.getByRole("option")).toHaveCount(all);
    await expect(page.getByRole("option", { name: /Locked/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await pickM4A1(page);
    const elcan = await elcanOption(page);
    await expect(elcan).toBeVisible();
    await expect(elcan.getByText("Locked")).toHaveCount(0);
  });

  test("LL2 switches to progression, and a reload stays there", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });

    await openProgression(page);
    await progressionPanel(page).getByRole("button", { name: "LL2", exact: true }).click();
    await expect(progressionPanel(page)).toHaveCount(0);

    const gated = `${fixtureBuildableWeaponCount()} weapons available on your profile`;
    await expectWeaponCount(page, gated);
    await expect(page.getByText("Set your progression")).toHaveCount(0);
    await expect(modeButton(page, "My progression…")).toHaveAttribute("aria-pressed", "true");
    await pickM4A1(page);
    await expect((await elcanOption(page)).getByText("Locked")).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await expectWeaponCount(page, gated);
    await expect(modeButton(page, "My progression…")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Set your progression")).toHaveCount(0);
    // The reload restores the build from its draft; the part stays locked under LL2.
    await expect((await elcanOption(page)).getByText("Locked")).toBeVisible();
  });

  test("switching back to theorycraft is kept across a reload, and so is the profile", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await openProgression(page);
    await progressionPanel(page).getByRole("button", { name: "LL2", exact: true }).click();
    await expect(modeButton(page, "My progression…")).toHaveAttribute("aria-pressed", "true");

    await modeButton(page, "Theorycraft").click();
    const all = `${fixtureBuildableWeaponCount()} weapons`;
    await expectWeaponCount(page, all);

    await page.reload({ waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await expectWeaponCount(page, all);
    await expect(modeButton(page, "Theorycraft")).toHaveAttribute("aria-pressed", "true");

    // With a profile set, theorycraft offers the way back to it, never a one-click profile
    // that would overwrite it: no prompt on the page. "My progression…" switches straight
    // back to the LL2 profile, and its panel then offers no one-click profiles either.
    await expect(page.getByText("Set your progression")).toHaveCount(0);
    await modeButton(page, "My progression…").click();
    await expect(modeButton(page, "My progression…")).toHaveAttribute("aria-pressed", "true");
    await expectWeaponCount(
      page,
      `${fixtureBuildableWeaponCount()} weapons available on your profile`,
    );
    await openProgression(page);
    await expect(
      progressionPanel(page).getByRole("button", { name: "LL2", exact: true }),
    ).toHaveCount(0);
  });
});
