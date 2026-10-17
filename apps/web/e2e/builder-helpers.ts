import type { Page } from "@playwright/test";
import { expect } from "./upstream.js";

/**
 * The Builder workbench's controls, as the specs drive them. One definition per control, so a
 * change to the workbench's markup is one edit here rather than one per spec.
 */

export const M4A1_LABEL = "Colt M4A1 5.56x45 assault rifle";

/** The weapon picker in the workbench's top bar: a combobox labelled "Weapon". */
export function weaponPicker(page: Page) {
  return page.getByRole("combobox", { name: "Weapon" });
}

/** Search the weapon picker for `label` and pick the option of exactly that name. */
export async function pickWeapon(page: Page, label: string = M4A1_LABEL): Promise<void> {
  const picker = weaponPicker(page);
  await expect(picker).toBeEnabled({ timeout: 15_000 });
  await picker.fill(label);
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(picker).toHaveValue(label);
}

/** Open the weapon picker and pick the first weapon it lists; returns that weapon's name. */
export async function pickFirstWeapon(page: Page): Promise<string> {
  const picker = weaponPicker(page);
  await expect(picker).toBeEnabled({ timeout: 15_000 });
  await picker.click();
  const first = page.getByRole("option").first();
  const name = (await first.locator("span").first().textContent()) ?? "";
  await first.click();
  await expect(picker).toHaveValue(name);
  return name;
}

/** The labelled "Preset" dropdown in the Build panel's header. */
export function presetSelect(page: Page) {
  return page.getByRole("combobox", { name: "Preset" });
}

/** The option of the preset dropdown whose text starts with `name`. */
export function presetOption(page: Page, name: RegExp) {
  return presetSelect(page).locator("option").filter({ hasText: name });
}

/** Choose the preset whose option text starts with `name`. */
export async function choosePreset(page: Page, name: RegExp): Promise<void> {
  const value = await presetOption(page, name).getAttribute("value");
  if (value === null) throw new Error(`no preset option matching ${String(name)}`);
  await presetSelect(page).selectOption(value);
}

/** Assert the preset dropdown shows the preset whose option text starts with `name`. */
export async function expectPreset(page: Page, name: RegExp, timeout = 15_000): Promise<void> {
  await expect(presetSelect(page).locator("option:checked")).toHaveText(name, { timeout });
}

/** The "My progression…" half of the top bar's mode switch, which opens the progression panel. */
export function progressionButton(page: Page) {
  return page.getByRole("group", { name: "Builder mode" }).getByRole("button", {
    name: "My progression…",
  });
}

/** The progression panel (a dialog), once open. */
export function progressionPanel(page: Page) {
  return page.getByRole("dialog", { name: /progression/i });
}

/** Open the progression panel from the top bar and wait for it. */
export async function openProgression(page: Page): Promise<void> {
  await progressionButton(page).click();
  await expect(progressionPanel(page)).toBeVisible();
}

/**
 * One stat in the stat strip or the Details panel: a `dl > div` cell whose `<dt>` is `label`.
 * Its first `<dd>` is the value, the second (where there is one) the line under it.
 */
export function stat(page: Page, label: string) {
  return page
    .locator("dl > div")
    .filter({ has: page.locator("dt").getByText(label, { exact: true }) });
}
