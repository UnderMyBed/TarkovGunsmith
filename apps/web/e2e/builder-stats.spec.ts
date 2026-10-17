import type { Page, Route } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { choosePreset, expectPreset, pickWeapon, stat } from "./builder-helpers.js";

/**
 * The stat strip's and Details panel's stats, each in its unit, for two captured M4A1 presets (#220). The expected
 * figures follow from the captured records: MOA is the parts' summed centerOfImpact at
 * 100/2.9089 MOA per cm, the accuracy modifiers then scaling it; muzzle velocity is the default
 * ammo's (M855, 922 m/s) times the summed velocity percents; sighting range is the longest of the
 * weapon's and its sights'. Upstream publishes 2.17 and 2.75 MOA for these presets, which is
 * the base figure shown under each.
 */

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
    await pickWeapon(page);
    await expectPreset(page, /^M4A1 Carbine/);

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
    await pickWeapon(page);
    await expectPreset(page, /^M4A1 Carbine/);
    await choosePreset(page, /^M4A1 SOPMOD II/);

    // The 10.3" barrel's 0.07 cm sets the base; a +3% accuracy part tightens it to 2.67.
    await expectStat(page, "Accuracy", "2.67 MOA", "base 2.75 · accuracy +3%");
    // −11% from the barrel and +0.7% from a part: 922 × 0.897.
    await expectStat(page, "Muzzle velocity", "827 m/s", "M855 · −10.3%");
    await expectStat(page, "Sighting range", "800 m");
  });

  test("a build whose ergonomics sum below 0 shows the game's 0, with the sum on hover", async ({
    page,
  }) => {
    // Captured ergonomics: M4A1 48, upper +5, Elcan −4, A2 20" barrel −32, front-sight gas
    // block −1, QDC kit −0.5, QDSS NT-4 −12, STANAG −1.5, carbine buffer tube −2, carry
    // handle −1. The plain sum is −1; the game floors it at 0.
    const id = "ergz2273";
    await page.route(`**/api/builds/${id}`, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: 6,
          weaponId: "5447a9cd4bdc2dbd208b4567",
          attachments: {
            mod_magazine: "55d4887d4bdc2d962f8b4570",
            mod_reciever: "55d355e64bdc2d962f8b4569",
            "mod_reciever/mod_scope": "57ac965c24597706be5f975c",
            "mod_reciever/mod_sight_rear": "5ae30bad5acfc400185c2dc4",
            "mod_reciever/mod_barrel": "68a63ac58e1fe612970728f2",
            "mod_reciever/mod_barrel/mod_gas_block": "5ae30e795acfc408fb139a0b",
            "mod_reciever/mod_barrel/mod_muzzle": "56ea8180d2720bf2698b456a",
            "mod_reciever/mod_barrel/mod_muzzle/mod_muzzle": "57da93632459771cb65bf83f",
            mod_stock: "5649be884bdc2d79388b4577",
          },
          orphaned: [],
          createdAt: "2026-10-17T00:00:00.000Z",
        }),
      }),
    );
    await page.goto(`/builder/${id}`, { waitUntil: "networkidle" });
    await expect(page.getByText("9 attached", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/couldn't be placed on this weapon/)).toHaveCount(0);

    const note = "−1 before the game's floor at 0";
    const cell = stat(page, "Ergonomics");
    // The strip's value is the game's 0, with the plain sum on hover.
    const value = cell.locator("dd").first();
    await expect(value).toHaveText("0");
    await expect(value).toHaveAttribute("title", note);
    // Under it: stock 48, and the delta −48 (named "worse") against the floored 0.
    await expect(cell.locator("dd").nth(1)).toHaveText("48 stock −48 worse");
  });
});
