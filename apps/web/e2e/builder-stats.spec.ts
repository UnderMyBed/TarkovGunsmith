import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * The Spec panel's stats, each in its unit, for two captured M4A1 presets (#220). The expected
 * figures follow from the captured records: MOA is the parts' summed centerOfImpact at
 * 100/2.9089 MOA per cm, the accuracy modifiers then scaling it; muzzle velocity is the default
 * ammo's (M855, 922 m/s) times the summed velocity percents; sighting range is the longest of the
 * weapon's and its sights'. Upstream publishes 2.17 and 2.75 MOA for these presets, which is
 * the base figure shown under each.
 */

const M4A1_LABEL = "Colt M4A1 5.56x45 assault rifle";

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

function stat(page: Page, label: string) {
  return page
    .locator("dl > div")
    .filter({ has: page.locator("dt").getByText(label, { exact: true }) });
}

async function expectStat(page: Page, label: string, value: string, detail?: string) {
  const cell = stat(page, label);
  await expect(cell.locator("dd").first()).toHaveText(value);
  if (detail !== undefined) await expect(cell.locator("dd").nth(1)).toHaveText(detail);
}

test.describe("Builder stats", () => {
  test("the default preset reports MOA, velocity, ranges, fire rate and its magazine", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });
    await expect(
      page.getByRole("group", { name: "Presets" }).getByRole("button", { name: /^M4A1 Carbine/ }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

    // (0.01 + 0.053) cm through the 14.5" barrel; no part carries an accuracy modifier.
    await expectStat(page, "Accuracy", "2.17 MOA", "base 2.17 · accuracy 0%");
    await expectStat(page, "Muzzle velocity", "922 m/s", "M855 · 0%");
    await expectStat(page, "Effective distance", "500 m");
    // The fitted scope's 600 m outranges the weapon's own 100 m.
    await expectStat(page, "Sighting range", "600 m");
    await expectStat(page, "Fire rate", "800 rpm");
    await expectStat(page, "Capacity", "30 rds");
    await expectStat(page, "Load/unload modifier", "0%");
    await expectStat(page, "Malfunction chance", "8%");
  });

  test("a preset with a short barrel and a muzzle device moves MOA and velocity", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });
    const presets = page.getByRole("group", { name: "Presets" });
    await expect(presets.getByRole("button", { name: /^M4A1 Carbine/ })).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 15_000 },
    );
    await presets.getByRole("button", { name: /^M4A1 SOPMOD II/ }).click();

    // The 10.3" barrel's 0.07 cm sets the base; a +3% accuracy part tightens it to 2.67.
    await expectStat(page, "Accuracy", "2.67 MOA", "base 2.75 · accuracy +3%");
    // −11% from the barrel and +0.7% from a part: 922 × 0.897.
    await expectStat(page, "Muzzle velocity", "827 m/s", "M855 · −10.3%");
    await expectStat(page, "Sighting range", "800 m");
  });
});
