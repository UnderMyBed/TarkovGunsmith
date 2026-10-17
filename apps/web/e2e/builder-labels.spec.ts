import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * The picker names the weapon on screen even when the profile cannot buy it (#222), and no two
 * slot rows under one parent read the same (#223).
 */

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_LABEL = "Colt M4A1 5.56x45 assault rifle";

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

/** Every visible slot row as [parent path, label]. */
async function slotRows(page: Page): Promise<[string, string][]> {
  return page.locator("details[data-slot-path]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const path = node.getAttribute("data-slot-path") ?? "";
      const label = node.querySelector(":scope > summary > span:nth-of-type(2)")?.textContent;
      return [path.split("/").slice(0, -1).join("/"), label ?? ""] as [string, string];
    }),
  );
}

test.describe("Builder weapon picker and slot labels", () => {
  test.describe("on a fresh profile in progression", () => {
    test.use({ playerProfile: "fresh" });

    test("a shared build of a locked weapon keeps it selected, marked locked", async ({ page }) => {
      // A fresh profile lands in theorycraft, where nothing is locked; the locked current
      // weapon (#222) is a progression state, so this visitor chose progression on LL1.
      await page.addInitScript(() => window.localStorage.setItem("tg:builder-mode", "progression"));
      await page.route("**/api/builds/abcd2348", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            version: 6,
            weaponId: M4A1,
            attachments: {},
            orphaned: [],
            createdAt: "2026-10-16T00:00:00.000Z",
          }),
        }),
      );
      await page.goto("/builder/abcd2348", { waitUntil: "networkidle" });

      const picker = weaponPicker(page);
      await expect(picker).toHaveValue(M4A1, { timeout: 15_000 });
      await expect(picker.locator("option:checked")).toHaveText(
        `${M4A1_LABEL} — LOCKED · peacekeeper LL2 barter`,
      );
      await expect(page.getByRole("button", { name: "Progression", pressed: true })).toBeVisible();
    });
  });

  test("no two slot rows under one parent share a label on the M4A1", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });
    await expect(page.locator('details[data-slot-path="mod_reciever/mod_barrel"]')).toBeAttached({
      timeout: 15_000,
    });

    const rows = await slotRows(page);
    const top = rows.filter(([parent]) => parent === "").map(([, label]) => label);
    expect(top).toEqual([
      "Pistol Grip",
      "Magazine",
      "Receiver",
      "Stock",
      "Ch. Handle",
      "Ch. Handle (B.A.D.)",
    ]);

    const byParent = new Map<string, string[]>();
    for (const [parent, label] of rows)
      byParent.set(parent, [...(byParent.get(parent) ?? []), label]);
    expect(byParent.size).toBeGreaterThan(1);
    for (const [parent, labels] of byParent) {
      expect(new Set(labels).size, `labels under "${parent}": ${labels.join(", ")}`).toBe(
        labels.length,
      );
    }
  });
});
