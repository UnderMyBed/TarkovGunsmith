import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";

/**
 * The Builder's item graph on the captured M4A1 (#213 #214 #215): a barrel is a real part whose
 * own slots open up once it is fitted — including the required gas block the old depth-3,
 * WeaponMod-only tree never showed — and an option that clashes with what is already fitted is
 * offered disabled, naming the part it clashes with.
 */

async function pickM4A1(page: Page) {
  const picker = page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await picker.selectOption({ label: "Colt M4A1 5.56x45 assault rifle" });
  await startEmpty(page);
}

/** New builds start from the weapon's default preset; these tests build from an empty weapon. */
async function startEmpty(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Presets" })
    .getByRole("button", { name: /^Empty/ })
    .click();
  await expect(page.getByText("0 attached")).toBeVisible();
}

function slot(page: Page, path: string) {
  return page.locator(`details[data-slot-path="${path}"]`);
}

async function fit(page: Page, path: string, itemName: RegExp): Promise<void> {
  const region = slot(page, path);
  // A summary click toggles: only open a slot that is closed.
  if (!(await region.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await region.locator(":scope > summary").click();
  }
  await region.locator(":scope > div").getByRole("button", { name: itemName }).first().click();
}

test.describe("Builder item graph", () => {
  test("a fitted barrel opens its own slots, required gas block included", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);

    await fit(page, "mod_reciever", /M4A1 5\.56x45 upper receiver/);
    await fit(page, "mod_reciever/mod_barrel", /10\.3 inch barrel/);

    const gasBlock = slot(page, "mod_reciever/mod_barrel/mod_gas_block");
    await expect(gasBlock).toBeVisible();
    await expect(gasBlock.locator(":scope > summary")).toContainText("Gas Block");
    await expect(gasBlock.locator(":scope > summary")).toContainText("REQUIRED");

    await fit(page, "mod_reciever/mod_barrel/mod_gas_block", /MK12 Low Profile Gas Block/);
    await expect(gasBlock.locator(":scope > summary")).toContainText("MK12 Low Profile Gas Block");
    await expect(gasBlock.locator(":scope > summary")).not.toContainText("REQUIRED");
  });

  test("an option that clashes with a fitted part is disabled, with the reason", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);

    await fit(page, "mod_reciever", /M4A1 5\.56x45 upper receiver/);
    // Upstream lists this pair on the handguard only; the barrel side is checked too.
    await fit(page, "mod_reciever/mod_barrel", /10\.3 inch barrel/);

    const handguard = slot(page, "mod_reciever/mod_handguard");
    await handguard.locator(":scope > summary").click();
    const clash = handguard
      .locator(":scope > div")
      .getByRole("button", { name: /Aeroknox AX-15 10\.5 inch M-LOK handguard/ });
    await expect(clash).toBeDisabled();
    await expect(clash).toContainText("Conflicts with");
  });

  test("swapping a barrel drops its gas block, so no hidden conflict survives", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);

    await fit(page, "mod_reciever", /M4A1 5\.56x45 upper receiver/);
    await fit(page, "mod_reciever/mod_barrel", /10\.3 inch barrel/);
    await fit(page, "mod_reciever/mod_barrel/mod_gas_block", /M4A1 front sight with gas block/);
    await fit(page, "mod_reciever/mod_handguard", /Aeroknox AX-15 4 inch/);
    await expect(page.getByText("4 attached")).toBeVisible();

    // The A2 20" barrel is offered; its gas-block slot is one the AX-15 4" blocks.
    await fit(page, "mod_reciever/mod_barrel", /A2 type 20 inch barrel/);

    const gasBlock = slot(page, "mod_reciever/mod_barrel/mod_gas_block");
    await expect(gasBlock.locator(":scope > summary")).toContainText("— empty —");
    await expect(page.getByText("3 attached")).toBeVisible();

    if (!(await gasBlock.evaluate((d) => (d as HTMLDetailsElement).open))) {
      await gasBlock.locator(":scope > summary").click();
    }
    const refit = gasBlock
      .locator(":scope > div")
      .getByRole("button", { name: /M4A1 front sight with gas block/ });
    await expect(refit).toBeDisabled();
    await expect(refit).toContainText("Conflicts with");
  });
});
