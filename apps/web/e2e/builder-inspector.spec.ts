import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import {
  fitButton,
  inspector,
  openProgression,
  partRow,
  pickWeapon,
  progressionPanel,
  selectSlot,
  slotRow,
  stat,
  weaponPicker,
} from "./builder-helpers.js";

/**
 * The slot inspector (#279): the tree selects a slot, and the inspector beside it lists the
 * parts that fit it, to search, sort and fit; the keyboard reaches all of it; and Compare
 * keeps a tree per side, with its diff markers.
 */

test.use({ playerProfile: "fresh" });

const MIAD = "AR-15 Magpul MIAD pistol grip (FDE)";
const A2_GRIP = "AR-15 Colt A2 pistol grip";
/** Peacekeeper LL3 only in the captures, and it clashes with the Carbine's charging handle. */
const ELCAN = /^ELCAN SpecterDR 1x\/4x scope(?! \()/;

/** The part names the inspector lists, in order. */
async function listedParts(page: Page): Promise<string[]> {
  return await inspector(page)
    .getByRole("list", { name: "Parts" })
    .getByRole("listitem")
    .evaluateAll((items) => items.map((li) => li.querySelector("span")?.textContent ?? ""));
}

test.describe("Slot inspector", () => {
  test("selecting a slot lists its parts; search, sort and Fit change the build", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);

    // The first slot is selected by default.
    const grip = slotRow(page, "mod_pistol_grip");
    await expect(grip).toHaveAttribute("aria-selected", "true");
    await expect(inspector(page)).toHaveAccessibleName("Pistol Grip options");
    await expect(inspector(page)).toContainText(`Fitted: ${A2_GRIP}`);
    await expect(fitButton(page, A2_GRIP)).toHaveText("Fitted");

    // A nested slot: selecting it swaps the inspector.
    await selectSlot(page, "mod_reciever/mod_barrel");
    await expect(inspector(page)).toHaveAccessibleName("Barrel options");
    await expect(grip).toHaveAttribute("aria-selected", "false");
    await selectSlot(page, "mod_pistol_grip");

    // Search narrows by name.
    const search = inspector(page).getByRole("searchbox", { name: "Search" });
    await search.fill("magpul");
    const names = await listedParts(page);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.toLowerCase()).toContain("magpul");
    await expect(inspector(page)).toContainText(`Showing ${names.length} of`);
    await search.fill("");

    // Sort by weight puts the lightest first.
    await inspector(page).getByRole("combobox", { name: "Sort by" }).selectOption("Weight");
    const weights = await inspector(page)
      .getByRole("list", { name: "Parts" })
      .getByRole("listitem")
      .evaluateAll((items) =>
        items.map((li) => {
          const kg = Array.from(li.querySelectorAll("span")).find((s) =>
            s.textContent?.trim().endsWith("kg"),
          );
          return Number.parseFloat(kg?.textContent ?? "NaN");
        }),
      );
    expect(weights.length).toBeGreaterThan(1);
    expect(weights).toEqual([...weights].sort((a, b) => a - b));

    // Fit a part: the tree row, the inspector and the stat strip all follow.
    const ergo = stat(page, "Ergonomics").locator("dd").first();
    const before = await ergo.innerText();
    await fitButton(page, MIAD).click();
    await expect(fitButton(page, MIAD)).toHaveText("Fitted");
    await expect(fitButton(page, A2_GRIP)).toHaveText("Fit");
    await expect(grip).toContainText(MIAD);
    await expect(grip).toHaveAttribute("aria-selected", "true");
    await expect(ergo).not.toHaveText(before);
  });

  test("on an LL2 profile a locked part shows why, and a clashing one cannot be fitted", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await expect(weaponPicker(page)).toBeEnabled({ timeout: 15_000 });
    await openProgression(page);
    await progressionPanel(page).getByRole("button", { name: "LL2", exact: true }).click();
    await pickWeapon(page);

    await selectSlot(page, "mod_reciever/mod_scope");
    const elcan = partRow(page, ELCAN);
    await expect(elcan.getByText("Locked")).toBeVisible();
    await expect(elcan.getByText("Peacekeeper LL3")).toBeVisible();
    await expect(elcan.getByText(/^Conflicts with/)).toBeVisible();
    await expect(fitButton(page, ELCAN)).toBeDisabled();
  });

  test("the keyboard moves through the tree, into the inspector, fits, and comes back", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);

    const grip = slotRow(page, "mod_pistol_grip");
    const magazine = slotRow(page, "mod_magazine");
    await grip.focus();
    await page.keyboard.press("ArrowDown");
    await expect(magazine).toBeFocused();
    // Arrows move focus, not the selection.
    await expect(grip).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Enter");
    await expect(magazine).toHaveAttribute("aria-selected", "true");
    const search = inspector(page).getByRole("searchbox", { name: "Search" });
    await expect(search).toBeFocused();
    await page.keyboard.type("PMAG 30 GEN M3 W");

    // Tab on to the first part's Fit, and fit it with the keyboard.
    const pmag = fitButton(page, /PMAG 30 GEN M3 W STANAG/);
    for (let i = 0; i < 6 && !(await pmag.evaluate((b) => b === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(pmag).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(pmag).toHaveText("Fitted");
    await expect(pmag).toBeFocused();
    await expect(magazine).toContainText("PMAG 30 GEN M3");

    // Escape returns to the slot's tree row.
    await page.keyboard.press("Escape");
    await expect(magazine).toBeFocused();
    // Right moves into a fitted part's own slots, Left back to their parent.
    await slotRow(page, "mod_reciever").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[role="treeitem"]:focus')).toHaveAttribute(
      "data-slot-path",
      /^mod_reciever\//,
    );
    await page.keyboard.press("ArrowLeft");
    await expect(slotRow(page, "mod_reciever")).toBeFocused();
  });
});

/** Compare side `label`'s card: the one holding its weapon picker. */
function side(page: Page, label: "A" | "B"): Locator {
  return page.locator("div.relative.z-10", { has: page.locator(`#compare-weapon-${label}`) });
}

test.describe("Compare with the slot inspector", () => {
  test("each side keeps its tree, inspector and diff markers, and neither scrolls sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expect(slotRow(page, "mod_pistol_grip")).toBeVisible();
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Compare this build" })
      .getByRole("button", { name: "Compare", exact: true })
      .click();
    await expect(page).toHaveURL(/\/builder\/compare$/);

    await expect(page.getByRole("tree")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByRole("tree", { name: "Build A slots" })).toBeVisible();
    await expect(page.getByRole("tree", { name: "Build B slots" })).toBeVisible();
    // The same build on both sides: nothing differs yet.
    await expect(page.locator('[data-diff="differs"]')).toHaveCount(0);

    // Swap side B's grip in its own inspector: that slot now differs, on both sides.
    const b = side(page, "B");
    await selectSlot(b, "mod_pistol_grip");
    await fitButton(b, MIAD).click();
    await expect(fitButton(b, MIAD)).toHaveText("Fitted");
    await expect(slotRow(side(page, "A"), "mod_pistol_grip")).toHaveAttribute(
      "data-diff",
      "differs",
    );
    await expect(slotRow(b, "mod_pistol_grip")).toHaveAttribute("data-diff", "differs");
    await expect(fitButton(side(page, "A"), A2_GRIP)).toHaveText("Fitted");

    for (const label of ["A", "B"] as const) {
      const overflow = await side(page, label).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `Compare side ${label} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1440,
    );
  });
});
