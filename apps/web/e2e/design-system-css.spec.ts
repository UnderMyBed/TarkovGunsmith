import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * In-browser half of the guard for GitHub issue #162, where Tailwind never scanned
 * `packages/ui/src` and every class used only by a `@tarkov/ui` primitive was missing from
 * the production stylesheet.
 *
 * `apps/web/src/styles.test.ts` proves the RULES are emitted, by compiling the stylesheet.
 * These tests prove the rules actually PAINT, by reading computed styles off a real page
 * served from a real build. Two things only a browser can answer:
 *
 *  1. Focus. `focus-visible:outline-none` was purged along with the ring it exists to
 *     replace, so the browser's own focus outline was the only focus indication in the app.
 *     Restoring the ring also restores `outline-none` — which means a broken or unpainted
 *     ring would leave keyboard users with NO focus indicator at all, strictly worse than
 *     the bug. Both halves are asserted together, on a Button and on an Input.
 *  2. `<Card variant="bracket">`'s corner marks, which are ::before/::after pseudo-elements.
 *     Nothing short of a real engine resolves those.
 */

/**
 * Focus `target` by keyboard, so `:focus-visible` matches.
 *
 * Chromium only matches `:focus-visible` on a <button> when focus arrived through the
 * keyboard, so a bare `.focus()` would silently assert nothing. Stepping backwards and
 * forwards lands on the same element via a real Tab, whatever precedes it in the document.
 */
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}

async function focusStyles(target: Locator): Promise<{ outlineStyle: string; boxShadow: string }> {
  return target.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
  });
}

test.describe("design system — styles reach the browser", () => {
  test("a keyboard-focused Button suppresses the UA outline AND paints its own ring", async ({
    page,
  }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });
    // Rendered unconditionally by CompareToolbar, and enabled while no pair is loaded.
    const save = page.getByRole("button", { name: "Save comparison" });
    await expect(save).toBeEnabled({ timeout: 15_000 });

    await focusByKeyboard(page, save);
    const { outlineStyle, boxShadow } = await focusStyles(save);

    expect(outlineStyle, "focus-visible:outline-none did not apply").toBe("none");
    expect(boxShadow, "the focus ring that replaces the UA outline paints nothing").not.toBe(
      "none",
    );
    expect(boxShadow, "the focus ring has no visible colour").toMatch(/rgb/);
  });

  test("a keyboard-focused Input suppresses the UA outline AND paints its own ring", async ({
    page,
  }) => {
    await page.goto("/calc", { waitUntil: "networkidle" });
    const distance = page.getByLabel("Distance (m)");
    await expect(distance).toBeVisible({ timeout: 15_000 });

    await focusByKeyboard(page, distance);
    const { outlineStyle, boxShadow } = await focusStyles(distance);

    expect(outlineStyle, "focus-visible:outline-none did not apply").toBe("none");
    expect(boxShadow, "the focus ring that replaces the UA outline paints nothing").not.toBe(
      "none",
    );
    expect(boxShadow, "the focus ring has no visible colour").toMatch(/rgb/);
  });

  test("Card variant=bracket paints its corner brackets", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // The keyboard-shortcut overlay is a <DialogPanel>, i.e. a bracket-variant <Card>.
    await page.keyboard.press("Shift+?");
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible({
      timeout: 5_000,
    });

    const panel = page.getByRole("dialog").locator(":scope > div").first();
    const corners = await panel.evaluate((el) =>
      (["::before", "::after"] as const).map((pseudo) => {
        const s = getComputedStyle(el, pseudo);
        return {
          pseudo,
          content: s.content,
          borderTopWidth: parseFloat(s.borderTopWidth),
          borderBottomWidth: parseFloat(s.borderBottomWidth),
          width: parseFloat(s.width),
          height: parseFloat(s.height),
        };
      }),
    );

    for (const corner of corners) {
      expect(corner.content, `${corner.pseudo} was never generated`).not.toBe("none");
      expect(corner.width, `${corner.pseudo} has no width`).toBeGreaterThan(0);
      expect(corner.height, `${corner.pseudo} has no height`).toBeGreaterThan(0);
      // Each corner draws exactly two of its four edges, so one of top/bottom is 0 and the
      // other is not — asserting the sum keeps this true for both corners at once.
      expect(
        corner.borderTopWidth + corner.borderBottomWidth,
        `${corner.pseudo} draws no border`,
      ).toBeGreaterThan(0);
    }
  });
});
