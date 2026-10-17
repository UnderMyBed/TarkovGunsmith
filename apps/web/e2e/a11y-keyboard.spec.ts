import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { pickWeapon, fitButton, fitPart, inspector, selectSlot } from "./builder-helpers.js";

/**
 * Browser half of GitHub issue #174 — keyboard and screen-reader correctness.
 *
 * The jsdom suites (`apps/web/src/routes/__root.test.tsx`,
 * `packages/ui/src/components/dialog.test.tsx`) cover the state machines: which element has
 * focus, which ARIA attributes are set, what Escape does. Three things they cannot answer,
 * and this file exists for those:
 *
 *  1. **Real tab order.** jsdom's tab order is a library's reimplementation of the spec.
 *     Whether a skip link genuinely comes first, and whether activating it genuinely moves
 *     the browser's focus past the nav, is a question only an engine settles.
 *  2. **Whether the skip link is actually revealed.** It is parked off-screen by a
 *     transform. jsdom runs no stylesheet, so it cannot see the transform, let alone that
 *     `:focus-visible` undoes it.
 *  3. **Whether arrow keys get past a disabled option.** `focus()` on a disabled button is a
 *     no-op only a real engine enforces, so a roving-focus list that includes one strands the
 *     user on the option above it.
 */

/** The element the browser currently has focused, as role + accessible-ish name. */
async function activeDescription(page: Page): Promise<{ tag: string; text: string; id: string }> {
  return page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName.toLowerCase() ?? "none",
      text: el?.textContent?.trim().slice(0, 40) ?? "",
      id: el?.id ?? "",
    };
  });
}

test.describe("skip link (issue #174, defect 3)", () => {
  test("is the very first Tab stop and is hidden until then", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const skip = page.getByRole("link", { name: "Skip to content" });

    // Parked off-screen: present in the accessibility tree, above the viewport on screen.
    const parked = await skip.boundingBox();
    expect(parked, "skip link should be laid out, just off-screen").not.toBeNull();
    expect(parked!.y).toBeLessThan(0);

    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();

    // Revealed — the transform that parked it is undone, so it lands inside the viewport.
    // Polled rather than read once: the reveal is a CSS transition, so a single read right
    // after the keypress catches the link mid-slide and still above the fold.
    await expect
      .poll(async () => (await skip.boundingBox())?.y ?? -1, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(0);
  });

  test("moves focus past the whole header, not just the scroll position", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");

    // Focus itself has to land on <main>. A fragment target with no tabindex scrolls the
    // page but leaves focus on the link, and the next Tab drops the user right back into
    // the nav they asked to skip — the skip link then does nothing for a keyboard user.
    expect(await activeDescription(page)).toMatchObject({ tag: "main", id: "main-content" });

    await page.keyboard.press("Tab");
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        insideMain: document.querySelector("main")?.contains(el) ?? false,
        insideHeader: document.querySelector("header")?.contains(el) ?? false,
      };
    });
    expect(landed.insideHeader, "Tab after skipping went back into the header").toBe(false);
    expect(landed.insideMain).toBe(true);
  });
});

test.describe("Builder slot tree arrow keys", () => {
  test("ArrowDown skips a disabled (conflicting) option instead of stopping above it", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);

    await fitPart(page, "mod_reciever", /M4A1 5\.56x45 upper receiver/);
    await fitPart(page, "mod_reciever/mod_barrel", /10\.3 inch barrel/);

    await selectSlot(page, "mod_reciever/mod_handguard");
    await expect(fitButton(page, /Aeroknox AX-15 10\.5 inch M-LOK handguard/)).toBeDisabled();

    // An enabled option directly above a run of disabled ones, and the next enabled option.
    const options = inspector(page).locator("[data-part-action]");
    const disabled = await options.evaluateAll((buttons) =>
      buttons.map((b) => (b as HTMLButtonElement).disabled),
    );
    const above = disabled.findIndex((d, k) => !d && disabled[k + 1] === true);
    const below = disabled.findIndex((d, k) => k > above && !d);
    expect(above, "an enabled option above a disabled one").toBeGreaterThanOrEqual(0);
    expect(below, "an enabled option below it").toBeGreaterThan(above + 1);

    await options.nth(above).focus();
    await expect(options.nth(above)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(below)).toBeFocused();
  });
});
