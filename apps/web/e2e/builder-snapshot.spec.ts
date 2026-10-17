import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * The Builder runs on the build-time snapshot (#211): its weapons, parts and slots come from
 * `/data/builder-snapshot.json`, and the only upstream request it makes is the raw `items`
 * document it prices from.
 */

/** The snapshot this run's build generated — the same file `wrangler pages dev` serves. */
const SNAPSHOT = JSON.parse(
  readFileSync(new URL("../dist/data/builder-snapshot.json", import.meta.url), "utf8"),
) as { dataAsOf: string; source: string };

const BOGUS_PART = "000000000000000000000000";

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

test.describe("Builder snapshot", () => {
  test("is the fixture snapshot outside the release deploy", () => {
    expect(SNAPSHOT.source).toBe("fixtures");
  });

  test("names the data's age and asks upstream for prices only", async ({ page }) => {
    const upstream: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "json.tarkov.dev") upstream.push(url.pathname);
    });

    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: "Colt M4A1 5.56x45 assault rifle" });

    const label = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(SNAPSHOT.dataAsOf));
    const stamp = page.locator(`time[datetime="${SNAPSHOT.dataAsOf}"]`);
    await expect(stamp).toHaveText(label);
    await expect(page.getByText(/^Game data ·/)).toBeVisible();

    await page.waitForLoadState("networkidle");
    expect([...new Set(upstream)]).toEqual(["/regular/items"]);
  });

  test("a shared build's part the game data no longer holds is orphaned, not lost", async ({
    page,
  }) => {
    await page.route("**/api/builds/abcd2346", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: 6,
          weaponId: "5447a9cd4bdc2dbd208b4567",
          attachments: {
            mod_reciever: "55d355e64bdc2d962f8b4569",
            mod_stock: BOGUS_PART,
          },
          orphaned: [],
          createdAt: "2026-10-16T00:00:00.000Z",
        }),
      }),
    );
    await page.goto("/builder/abcd2346", { waitUntil: "networkidle" });

    await expect(page.getByText("1 attached")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("1 mod from the saved build couldn't be placed on this weapon."),
    ).toBeVisible();
    await expect(page.getByText(`${BOGUS_PART} — no longer in the game data`)).toBeVisible();
  });

  test("a tab opened before a deploy is told to reload", async ({ page }) => {
    await page.route("**/data/builder-snapshot.json", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ response, json: { ...body, schema: 999 } });
    });
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(page.getByText("Game data was updated. Reload the page.")).toBeVisible({
      timeout: 15_000,
    });
  });
});
