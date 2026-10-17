import type { ConsoleMessage, Locator, Page } from "@playwright/test";
import { test, expect, OPTIMIZER_CHANGED_SLOTS } from "./upstream.js";
import { ROUTES } from "./routes.js";
import {
  choosePreset,
  expectPreset,
  fitButton,
  pickFirstWeapon,
  pickWeapon,
  slotRow,
  stat,
} from "./builder-helpers.js";

/**
 * The site at phone width (the `phone` project in `playwright.config.ts`: 390 × 844, touch,
 * mobile viewport). Every shipped route loads cleanly and fits the screen, and the Builder's
 * phone layout works: a tree of tappable rows whose parts open in a bottom sheet, the stat strip
 * as a 3×2 grid, and Compare and Optimize in a bar fixed to the bottom of the screen.
 *
 * "Fits" is measured against the 390 px viewport, not `window.innerWidth`. On a mobile
 * viewport Chromium widens the layout viewport to whatever overflows, so `innerWidth` follows
 * the bug instead of exposing it.
 */

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

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

/**
 * Every element that does not fit the screen (#265), described so a failure names it:
 *
 * - drawn past either edge: its box, cut down by every ancestor that clips sideways, still runs
 *   outside 0–{@link PHONE_WIDTH} px. This catches what the page's scroll width cannot, such as
 *   content hanging off a card that clips it.
 * - silently clipped: it cuts its own content off sideways (`scrollWidth > clientWidth`) without
 *   an ellipsis to say so — the part names and stat values #265 found cut off at a card's edge.
 *
 * A box no wider than 1 px is visually hidden text (`sr-only`), which clips by design. An element
 * built to scroll sideways opts out explicitly with `data-x-scroll`; nothing else is excused.
 */
async function overflowing(page: Page): Promise<string[]> {
  return await page.evaluate((width) => {
    const describe = (el: Element, detail: string) => {
      const name =
        el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().replace(/\s+/g, " ");
      return `<${el.tagName.toLowerCase()}> "${name.slice(0, 60)}" ${detail}`;
    };
    const clipsX = (style: CSSStyleDeclaration) => style.overflowX !== "visible";
    const found: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;

      let left = box.left;
      let right = box.right;
      for (let up = el.parentElement; up !== null && up !== document.body; up = up.parentElement) {
        if (!clipsX(getComputedStyle(up))) continue;
        const clip = up.getBoundingClientRect();
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      if (right > left && (right > width + 0.5 || left < -0.5)) {
        found.push(describe(el, `is drawn from x=${left.toFixed(1)} to x=${right.toFixed(1)}`));
      }

      if (
        el instanceof HTMLElement &&
        clipsX(style) &&
        el.clientWidth > 1 &&
        el.scrollWidth > el.clientWidth + 1 &&
        style.textOverflow !== "ellipsis" &&
        el.closest("[data-x-scroll]") === null
      ) {
        found.push(
          describe(el, `cuts off its content: ${el.scrollWidth} px in ${el.clientWidth} px`),
        );
      }
    }
    return found;
  }, PHONE_WIDTH);
}

/** Nothing scrolls sideways, and no element hangs off the screen or is cut off unannounced. */
async function expectFits(page: Page, where: string): Promise<void> {
  expect(await contentWidth(page), `${where} scrolls sideways`).toBeLessThanOrEqual(PHONE_WIDTH);
  expect(await overflowing(page), `${where}: elements that do not fit`).toEqual([]);
}

/** The bar fixed to the bottom of a phone screen, with Compare and Optimize. */
function actionBar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Build actions" });
}

/** The bottom sheet for the slot labelled `slot`. */
function sheet(page: Page, slot: string): Locator {
  return page.getByRole("dialog", { name: `${slot} options` });
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) throw new Error("element has no box");
  return b;
}

test.describe("phone width", () => {
  for (const route of ROUTES) {
    test(`${route.path} loads and fits the screen`, async ({ page }) => {
      const errors = captureConsoleErrors(page);
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.getByText(route.contains, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
      await expectFits(page, route.path);
      expect(errors, `Console errors on ${route.path}:\n${errors.join("\n")}`).toEqual([]);
    });
  }

  test("the Builder picks a weapon, applies its preset and changes a part in the sheet", async ({
    page,
  }) => {
    const errors = captureConsoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expectPreset(page, /^M4A1 Carbine/);
    await expect(stat(page, "Fire rate").locator("dd").first()).toHaveText("800 rpm");
    await expect(stat(page, "Capacity").locator("dd").first()).toHaveText("30 rds");
    // Once a weapon is picked, the top bar, the stat strip and the slot rows still fit (#265).
    await expectFits(page, "the Builder with a weapon");

    // Swap the STANAG for the PMAG by touch: tap the magazine row, then Fit in the sheet.
    const magazine = slotRow(page, "mod_magazine");
    await magazine.tap();
    await expect(sheet(page, "Magazine")).toBeVisible();
    await expectFits(page, "the magazine sheet");
    await fitButton(page, /AR-15 5\.56x45 Magpul PMAG 30 GEN M3 W STANAG 30-round magazine/).tap();

    // Fit closes the sheet, and focus is back on the row, which shows the new part.
    await expect(sheet(page, "Magazine")).toBeHidden();
    await expect(magazine).toBeFocused();
    await expect(magazine).toContainText("PMAG 30 GEN M3");
    await expect(magazine).toHaveAttribute("aria-selected", "true");
    await expectPreset(page, /^Custom parts$/, 5_000);
    await expectFits(page, "the Builder after a fit");
    expect(errors, `Console errors on the Builder:\n${errors.join("\n")}`).toEqual([]);
  });

  test("the sheet closes on Escape and on Close, and focus goes back to the row", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expectPreset(page, /^M4A1 Carbine/);
    const magazine = slotRow(page, "mod_magazine");

    await magazine.tap();
    const open = sheet(page, "Magazine");
    await expect(open).toBeVisible();
    // Focus moves into the sheet, a modal over the page.
    await expect(open.locator(":focus")).toHaveCount(1);
    await expect(open).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(open).toBeHidden();
    await expect(magazine).toBeFocused();

    await magazine.tap();
    await open.getByRole("button", { name: "Close" }).tap();
    await expect(open).toBeHidden();
    await expect(magazine).toBeFocused();
  });

  test("the phone layout: full-width picker, 3×2 stats, 52 px rows, and a bar the page clears", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expectPreset(page, /^M4A1 Carbine/);

    // The picker has a row of its own under the wordmark and Share, and the mode switch sits
    // under it, the full width of the bar.
    const workbench = page.getByRole("region", { name: "Workbench" });
    const content = (await box(workbench)).width - 2 * 16;
    const share = workbench.getByRole("button", { name: "Share build" });
    await expect(share).toBeVisible();
    const shareBox = await box(share);
    const picker = await box(workbench.getByRole("combobox", { name: "Weapon" }));
    const modes = await box(page.getByRole("group", { name: "Builder mode" }));
    expect(picker.y).toBeGreaterThanOrEqual(shareBox.y + shareBox.height);
    expect(picker.x).toBeLessThan(16 + 24);
    expect(modes.y).toBeGreaterThanOrEqual(picker.y + picker.height);
    expect(modes.x).toBeCloseTo(16, 0);
    expect(modes.width).toBeCloseTo(content, 0);
    // Compare and Optimize are neither in the top bar nor in the stat strip.
    await expect(workbench.getByRole("button", { name: "Compare" })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Build stats" }).getByRole("button", { name: "Optimize" }),
    ).toHaveCount(0);

    // Six stat cells in three columns and two rows.
    const cells = page.getByRole("region", { name: "Build stats" }).locator("dl > div");
    await expect(cells).toHaveCount(6);
    const cellBoxes = await Promise.all((await cells.all()).map(box));
    expect(new Set(cellBoxes.map((b) => Math.round(b.x))).size).toBe(3);
    expect(new Set(cellBoxes.map((b) => Math.round(b.y))).size).toBe(2);

    // Every row is at least 52 px tall.
    const rows = await page.getByRole("tree", { name: "Slots" }).getByRole("treeitem").all();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect((await box(row)).height).toBeGreaterThanOrEqual(52);

    // Compare and Optimize sit in a bar fixed to the screen's bottom edge.
    const actions = actionBar(page);
    await expect(actions.getByRole("button", { name: "Compare" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Optimize" })).toBeVisible();
    const fixed = await box(actions);
    expect(fixed.y + fixed.height).toBeCloseTo(PHONE_HEIGHT, 0);

    // Scrolled to the end, the page's last panel ends above the bar, not under it.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const details = await box(page.getByRole("region", { name: "Details" }));
    expect(details.y + details.height).toBeLessThanOrEqual((await box(actions)).y);
  });

  test("optimize mode stacks the optimizer under the tree, runs, and fits", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickFirstWeapon(page);
    await choosePreset(page, /^Empty/);
    await expect(page.getByText("0 attached", { exact: true })).toBeVisible();

    await actionBar(page).getByRole("button", { name: "Optimize" }).tap();
    await expect(page).toHaveURL(/\?view=optimize/);
    const optimizer = page.getByRole("complementary", { name: "Optimizer" });
    await expect(optimizer).toBeVisible();
    const tree = await box(page.getByRole("region", { name: "Build with proposed changes" }));
    expect((await box(optimizer)).y).toBeGreaterThanOrEqual(tree.y + tree.height);
    await expectFits(page, "optimize mode");

    await optimizer.getByRole("button", { name: /^Run( again)?$/ }).tap();
    await expect
      .poll(
        async () =>
          await page
            .getByRole("tree", { name: "Slots" })
            .locator('[role="treeitem"][aria-checked]')
            .count(),
        { timeout: 15_000 },
      )
      .toBe(OPTIMIZER_CHANGED_SLOTS);
    await expect(page.getByRole("region", { name: "Build stats, proposed" })).toBeVisible();
    await expectFits(page, "optimize mode with a proposal");

    await actionBar(page).getByRole("button", { name: "Back to build" }).tap();
    await expect(optimizer).toBeHidden();
    await expect(page.getByRole("region", { name: "Build", exact: true })).toBeVisible();
  });
});
