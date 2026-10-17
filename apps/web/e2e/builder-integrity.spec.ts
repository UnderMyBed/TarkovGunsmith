import type { Page, Route } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * Build integrity (#219): what a saved build holds is either on the weapon or listed as
 * orphaned, never hidden; a build missing a required part, or holding two parts that clash,
 * says so. Every build here is served by `page.route`, and the one share is answered in the
 * browser, so the suite writes nothing to the builds-api.
 */

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const M4_CARBINE_HANDGUARD = "5ae30db85acfc408fb139a05";
const COLT_A2_GRIP = "55d4b9964bdc2d1d4e8b456e";
const ADAR_WOODEN_STOCK = "5c0e2ff6d174af02a1659d4a";
const COLT_BUFFER_TUBE = "5649be884bdc2d79388b4577";
const M4SS = "55d4ae6c4bdc2d8b2f8b456e";
const CHARGING_HANDLE = "55d44fd14bdc2d962f8b456e";
const CREATED = "2026-10-16T00:00:00.000Z";

function serve(page: Page, url: string, body: unknown) {
  return page.route(url, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

function attached(page: Page, count: number) {
  return page.getByText(`${count} attached`, { exact: true });
}

const orphanBanner = (page: Page, n: number) =>
  page.getByText(
    `${n} mod${n === 1 ? "" : "s"} from the saved build couldn't be placed on this weapon.`,
  );

test.describe("Builder build integrity", () => {
  test("a handguard saved with no upper is orphaned, and a re-share carries it", async ({
    page,
  }) => {
    await serve(page, "**/api/builds/abcd2362", {
      version: 6,
      weaponId: M4A1,
      attachments: {
        "mod_reciever/mod_handguard": M4_CARBINE_HANDGUARD,
        mod_pistol_grip: COLT_A2_GRIP,
      },
      orphaned: [],
      createdAt: CREATED,
    });
    let shared: unknown = null;
    await page.route("**/api/builds", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      shared = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "abcd2399", url: "/api/builds/abcd2399" }),
      });
    });
    await page.goto("/builder/abcd2362", { waitUntil: "networkidle" });

    await expect(attached(page, 1)).toBeVisible({ timeout: 15_000 });
    await expect(orphanBanner(page, 1)).toBeVisible();
    await expect(page.getByText("AR-15 Colt M4 Carbine Length handguard")).toBeVisible();

    await page.getByRole("button", { name: "Share build" }).click();
    await expect(page.getByText("Build URL copied")).toBeVisible();
    expect(shared).toMatchObject({
      version: 6,
      weaponId: M4A1,
      attachments: { mod_pistol_grip: COLT_A2_GRIP },
      orphaned: [M4_CARBINE_HANDGUARD],
    });
    expect(Object.keys((shared as { attachments: object }).attachments)).toEqual([
      "mod_pistol_grip",
    ]);
  });

  test("a v1 link whose handguard the legacy tree puts under an empty upper is orphaned", async ({
    page,
  }) => {
    await serve(page, "**/api/builds/abcd2352", {
      version: 1,
      weaponId: M4A1,
      modIds: [M4_CARBINE_HANDGUARD],
      createdAt: CREATED,
    });
    await page.goto("/builder/abcd2352", { waitUntil: "networkidle" });

    await expect(attached(page, 0)).toBeVisible({ timeout: 15_000 });
    await expect(orphanBanner(page, 1)).toBeVisible();
    await expect(page.getByText("AR-15 Colt M4 Carbine Length handguard")).toBeVisible();
  });

  test("a build with an empty required slot is flagged incomplete", async ({ page }) => {
    await serve(page, "**/api/builds/abcd2353", {
      version: 6,
      weaponId: M4A1,
      attachments: { mod_pistol_grip: COLT_A2_GRIP },
      orphaned: [],
      createdAt: CREATED,
    });
    await page.goto("/builder/abcd2353", { waitUntil: "networkidle" });

    // Receiver, stock and charging handle are required on the M4A1.
    const flag = page.getByText("Incomplete · 3 required empty");
    await expect(flag).toBeVisible({ timeout: 15_000 });
    await expect(flag).toHaveAttribute(
      "title",
      "Required slots empty: Receiver, Stock, Ch. Handle",
    );
  });

  test("two fitted parts that clash are flagged, and each row names the other", async ({
    page,
  }) => {
    await serve(page, "**/api/builds/abcd2354", {
      version: 6,
      weaponId: M4A1,
      attachments: {
        mod_pistol_grip: ADAR_WOODEN_STOCK,
        mod_reciever: M4A1_UPPER,
        mod_stock: COLT_BUFFER_TUBE,
        "mod_stock/mod_stock_000": M4SS,
        mod_charge: CHARGING_HANDLE,
      },
      orphaned: [],
      createdAt: CREATED,
    });
    await page.goto("/builder/abcd2354", { waitUntil: "networkidle" });

    const flag = page.getByText("Conflict · 1");
    await expect(flag).toBeVisible({ timeout: 15_000 });
    await expect(flag).toHaveAttribute("title", "ADAR wood × M4SS");
    // Flagged, not removed: both parts stay on the weapon.
    await expect(attached(page, 5)).toBeVisible();
    await expect(
      page.locator('[data-slot-path="mod_pistol_grip"] > summary').getByText("Conflicts with M4SS"),
    ).toBeVisible();
    // The M4SS row sits inside the collapsed Stock row; open it to see the other side.
    await page.locator('[data-slot-path="mod_stock"] > summary').click();
    await expect(
      page
        .locator('[data-slot-path="mod_stock/mod_stock_000"] > summary')
        .getByText("Conflicts with ADAR wood"),
    ).toBeVisible();
  });

  test("a saved comparison's side with a handguard under no upper lists it as orphaned", async ({
    page,
  }) => {
    await serve(page, "**/api/pairs/abcd2355", {
      v: 1,
      createdAt: CREATED,
      left: {
        version: 2,
        weaponId: M4A1,
        attachments: {
          "mod_reciever/mod_handguard": M4_CARBINE_HANDGUARD,
          mod_pistol_grip: COLT_A2_GRIP,
        },
        orphaned: [],
        createdAt: CREATED,
      },
      right: null,
    });
    await page.goto("/builder/compare/abcd2355", { waitUntil: "networkidle" });

    await expect(page.getByText("1 attached · incomplete")).toBeVisible({ timeout: 15_000 });
    await expect(orphanBanner(page, 1)).toBeVisible();
    await expect(page.getByText("AR-15 Colt M4 Carbine Length handguard")).toBeVisible();
  });
});
