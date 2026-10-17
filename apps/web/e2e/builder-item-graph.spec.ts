import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import {
  choosePreset,
  pickWeapon,
  fitButton,
  fitPart,
  partRow,
  selectSlot,
  slotRow,
} from "./builder-helpers.js";

/**
 * The Builder's item graph on the captured M4A1 (#213 #214 #215): a barrel is a real part whose
 * own slots open up once it is fitted — including the required gas block the old depth-3,
 * WeaponMod-only tree never showed — and an option that clashes with what is already fitted is
 * offered disabled, naming the part it clashes with.
 */

async function pickM4A1(page: Page) {
  await pickWeapon(page);
  await startEmpty(page);
}

/** New builds start from the weapon's default preset; these tests build from an empty weapon. */
async function startEmpty(page: Page): Promise<void> {
  await choosePreset(page, /^Empty/);
  await expect(page.getByText("0 attached", { exact: true })).toBeVisible();
}

function slot(page: Page, path: string) {
  return slotRow(page, path);
}

async function fit(page: Page, path: string, itemName: RegExp): Promise<void> {
  await fitPart(page, path, itemName);
}

test.describe("Builder item graph", () => {
  test("a fitted barrel opens its own slots, required gas block included", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);

    await fit(page, "mod_reciever", /M4A1 5\.56x45 upper receiver/);
    await fit(page, "mod_reciever/mod_barrel", /10\.3 inch barrel/);

    const gasBlock = slot(page, "mod_reciever/mod_barrel/mod_gas_block");
    await expect(gasBlock).toBeVisible();
    await expect(gasBlock).toContainText("Gas Block");
    await expect(gasBlock).toContainText("Required");

    await fit(page, "mod_reciever/mod_barrel/mod_gas_block", /MK12 Low Profile Gas Block/);
    await expect(gasBlock).toContainText("MK12 Low Profile Gas Block");
    await expect(gasBlock).not.toContainText("Required");
  });

  test("an option that clashes with a fitted part is disabled, with the reason", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickM4A1(page);

    await fit(page, "mod_reciever", /M4A1 5\.56x45 upper receiver/);
    // Upstream lists this pair on the handguard only; the barrel side is checked too.
    await fit(page, "mod_reciever/mod_barrel", /10\.3 inch barrel/);

    await selectSlot(page, "mod_reciever/mod_handguard");
    const clash = /Aeroknox AX-15 10\.5 inch M-LOK handguard/;
    await expect(fitButton(page, clash)).toBeDisabled();
    await expect(partRow(page, clash)).toContainText("Conflicts with");
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
    await expect(gasBlock).toContainText("empty");
    await expect(page.getByText("3 attached")).toBeVisible();

    await selectSlot(page, "mod_reciever/mod_barrel/mod_gas_block");
    const refit = /M4A1 front sight with gas block/;
    await expect(fitButton(page, refit)).toBeDisabled();
    await expect(partRow(page, refit)).toContainText("Conflicts with");
  });
});
