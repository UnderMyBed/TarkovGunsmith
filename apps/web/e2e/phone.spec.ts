import type { ConsoleMessage, Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { ROUTES } from "./routes.js";
import { expectPreset, pickWeapon, stat } from "./builder-helpers.js";

/**
 * The site at phone width (the `phone` project in `playwright.config.ts`: 390 × 844, touch,
 * mobile viewport). Every shipped route loads cleanly and fits the screen, and the core
 * Builder flow works: pick a weapon, get its default preset and stats, change a part.
 *
 * "Fits" is measured against the 390 px viewport, not `window.innerWidth`. On a mobile
 * viewport Chromium widens the layout viewport to whatever overflows, so `innerWidth` follows
 * the bug instead of exposing it.
 */

const PHONE_WIDTH = 390;

function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** How wide the page's content is, in CSS px. More than {@link PHONE_WIDTH} scrolls sideways. */
function contentWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe("phone width", () => {
  for (const route of ROUTES) {
    test(`${route.path} loads and fits the screen`, async ({ page }) => {
      const errors = captureConsoleErrors(page);
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.getByText(route.contains, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
      expect(await contentWidth(page), `${route.path} scrolls sideways`).toBeLessThanOrEqual(
        PHONE_WIDTH,
      );
      expect(errors, `Console errors on ${route.path}:\n${errors.join("\n")}`).toEqual([]);
    });
  }

  test("the Builder picks a weapon, applies its preset and changes a part", async ({ page }) => {
    const errors = captureConsoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expectPreset(page, /^M4A1 Carbine/);
    await expect(stat(page, "Fire rate").locator("dd").first()).toHaveText("800 rpm");
    await expect(stat(page, "Capacity").locator("dd").first()).toHaveText("30 rds");

    // Swap the STANAG for the PMAG by touch: open the magazine slot and tap the part.
    const magazine = page.locator('[data-slot-path="mod_magazine"]');
    await magazine.locator("> summary").tap();
    await magazine
      .getByRole("button", {
        name: /AR-15 5\.56x45 Magpul PMAG 30 GEN M3 W STANAG 30-round magazine/,
      })
      .tap();
    await expect(magazine.locator("> summary")).toContainText("PMAG 30 GEN M3");
    await expectPreset(page, /^Custom parts$/, 5_000);

    // Once a weapon is picked, the workbench bar, the stat strip and the slot rows must still
    // fit a 390 px screen (issue #265).
    expect(await contentWidth(page), "the Builder scrolls sideways").toBeLessThanOrEqual(
      PHONE_WIDTH,
    );
    expect(errors, `Console errors on the Builder:\n${errors.join("\n")}`).toEqual([]);
  });
});
