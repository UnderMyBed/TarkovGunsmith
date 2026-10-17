import type { Page, Route } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { upstreamFixtureBody } from "./upstream-fixtures.js";

/**
 * Live prices (#212): a Web Worker fetches upstream's `items` document and posts back only the
 * prices the snapshot needs. The Builder renders from the snapshot without waiting for them,
 * and a failed price fetch leaves every price unknown rather than failing the Builder.
 */

const ITEMS = "https://json.tarkov.dev/regular/items";

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

async function pickM4A1(page: Page): Promise<void> {
  await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
  await weaponPicker(page).selectOption({ label: "Colt M4A1 5.56x45 assault rifle" });
  await expect(page.locator('details[data-slot-path="mod_reciever"]')).toBeVisible();
}

test.describe("Builder prices", () => {
  test("are fetched by the price worker, not the page", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(new URL(worker.url()).pathname));
    const items = page.waitForRequest(ITEMS);
    await page.goto("/builder");
    await items;
    expect(workers).toEqual([expect.stringMatching(/^\/assets\/prices\.worker-[\w-]+\.js$/)]);
  });

  test("do not hold up the Builder: it renders before they arrive", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let asked = false;
    await page.route(ITEMS, async (route: Route) => {
      asked = true;
      await held;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: upstreamFixtureBody("items")!,
      });
    });

    await page.goto("/builder");
    await pickM4A1(page);
    expect(asked).toBe(true);

    release();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('details[data-slot-path="mod_reciever"]')).toBeVisible();
  });

  test("that fail to load leave the Builder working, every price unknown", async ({ page }) => {
    await page.route(ITEMS, (route: Route) =>
      route.fulfill({ status: 503, statusText: "Service Unavailable", body: "" }),
    );
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);
    await expect(page.getByText(/Failed to load/)).toHaveCount(0);
  });
});
