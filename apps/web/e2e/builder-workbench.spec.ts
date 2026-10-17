import { test, expect } from "./upstream.js";
import { fixtureBuildableWeaponCount } from "./upstream-fixtures.js";
import {
  M4A1_LABEL,
  progressionButton,
  progressionPanel,
  stat,
  weaponPicker,
} from "./builder-helpers.js";

/**
 * The workbench's top bar (#278): the weapon picker is a searchable combobox the keyboard
 * drives end to end, `/` jumps to it from anywhere but a text field, and the one mode switch
 * opens the progression panel, whose one-click profile switches to progression for good.
 */

test.use({ playerProfile: "fresh" });

test.describe("Workbench weapon picker", () => {
  test("filters as you type, picks with the keyboard, and Escape puts the pick back", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picker = weaponPicker(page);
    await expect(picker).toBeEnabled({ timeout: 15_000 });

    await picker.click();
    await expect(page.getByRole("option")).toHaveCount(fixtureBuildableWeaponCount());
    await picker.fill("m4a1 colt");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(picker).toHaveAttribute("aria-activedescendant", /.+/);
    await page.keyboard.press("Enter");

    await expect(picker).toHaveValue(M4A1_LABEL);
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    await expect(stat(page, "Ergonomics")).toBeVisible();

    // A search abandoned with Escape leaves the weapon on screen as it was.
    await picker.fill("zzz");
    await expect(page.locator("p", { hasText: "No weapon matches" })).toBeVisible();
    // Spoken too, and the highlight points at no option.
    await expect(page.getByRole("status").filter({ hasText: "No weapon matches" })).toHaveCount(1);
    await expect(picker).not.toHaveAttribute("aria-activedescendant");
    await page.keyboard.press("Escape");
    await expect(picker).toHaveValue(M4A1_LABEL);
  });

  test("/ focuses the picker, but types a / in a text field", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picker = weaponPicker(page);
    await expect(picker).toBeEnabled({ timeout: 15_000 });

    await page.locator("body").click({ position: { x: 5, y: 400 } });
    await page.keyboard.press("/");
    await expect(picker).toBeFocused();
    await expect(picker).toHaveValue("");

    const name = page.getByLabel("Build name");
    await name.click();
    await page.keyboard.type("a/b");
    await expect(name).toHaveValue("a/b");
    await expect(name).toBeFocused();
  });
});

test.describe("Workbench progression", () => {
  test("a first visit prompts for progression; LL2 switches to it and survives a reload", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText("Set your progression.")).toBeVisible();

    // The prompt's own button opens the same panel as the switch.
    await page.getByRole("button", { name: "Set progression…" }).click();
    const panel = progressionPanel(page);
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "LL2", exact: true }).click();

    await expect(panel).toHaveCount(0);
    await expect(progressionButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Set your progression.")).toHaveCount(0);

    await page.reload({ waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await expect(progressionButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Set your progression.")).toHaveCount(0);
  });
});
