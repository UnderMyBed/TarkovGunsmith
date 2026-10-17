import type { Page, Route } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { upstreamFixtureBody } from "./upstream-fixtures.js";
import { pickWeapon, weaponPicker } from "./builder-helpers.js";

/**
 * Live prices (#212): a Web Worker fetches upstream's `items` document and posts back only the
 * prices the snapshot needs. The Builder renders from the snapshot without waiting for them,
 * and a failed price fetch leaves every price unknown rather than failing the Builder.
 */

const ITEMS = "https://json.tarkov.dev/regular/items";
const M4A1 = "5447a9cd4bdc2dbd208b4567";

async function pickM4A1(page: Page): Promise<void> {
  await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
  await pickWeapon(page);
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
    // The worker asks once the snapshot is in; its answer is held until released below.
    await expect.poll(() => asked).toBe(true);

    // Until prices arrive the build has no cost, and a budget cannot be checked.
    await expect(page.getByText("Prices loading…", { exact: true })).toBeVisible();
    await expect(page.getByTestId("build-cost")).toHaveCount(0);
    await page.getByRole("button", { name: "Optimize", exact: true }).click();
    const budget = page.getByLabel("Budget");
    await expect(budget).toBeDisabled();
    await expect(budget).toHaveAttribute("placeholder", "Budget needs prices");

    release();
    await expect(budget).toBeEnabled({ timeout: 15_000 });
    await expect(budget).toHaveAttribute("placeholder", "No cap");
  });

  test("price the whole build, weapon included, and say how old they are", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);
    await expect(page.getByText(/^Prices as of /)).toBeVisible({ timeout: 15_000 });
    // The seeded build is exactly the M4A1 Carbine preset, so it costs the preset's own flea
    // price and nothing more: its parts come with it.
    await expect(page.getByTestId("build-cost")).toHaveText(
      "Cost₽26,666as the M4A1 Carbine preset",
    );
  });

  test("that fail to load leave the Builder working, every price unknown", async ({ page }) => {
    let asked = 0;
    await page.route(ITEMS, (route: Route) => {
      asked += 1;
      return route.fulfill({ status: 503, body: "" });
    });
    await page.goto("/builder");
    await pickM4A1(page);
    await expect(page.getByText(/Failed to load/)).toHaveCount(0);
    await expect(
      page.getByText("Prices unavailable: json.tarkov.dev answered 503 Service Unavailable", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("build-cost")).toHaveCount(0);
    // Asked once and retried once, each a `no-cache` request and a fallback to the HTTP cache,
    // which holds no copy and so asks upstream too; the components mounted since do not ask.
    expect(asked).toBe(4);
  });

  test("price each Compare side", async ({ page }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });
    const left = page.locator("#compare-weapon-A");
    await expect(left.locator(`option[value="${M4A1}"]`)).toHaveCount(1, { timeout: 15_000 });
    await left.selectOption(M4A1);
    // Side A, with no profile, is priced with every gate open; side B is empty.
    await expect(page.getByTestId("compare-price-row")).toHaveText("₽26,666—", { timeout: 15_000 });
  });
});
