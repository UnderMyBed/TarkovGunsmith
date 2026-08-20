import { test, expect, type Locator, type Page } from "@playwright/test";

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
 *  3. **Whether raw `<button>` elements paint a focus ring.** `e2e/design-system-css.spec.ts`
 *     asserts this for `<Button>` and `<Input>`. Issue #174 defect 3 was that the app's raw
 *     buttons — tab strips, table sort headers, mod-list rows — had no focus treatment at
 *     all and fell back to the UA default, which `focus-visible:outline-none` then removed
 *     from under them everywhere else. They now share `focusRing`; this proves it paints.
 */

/**
 * Focus `target` by keyboard, so `:focus-visible` matches.
 *
 * Chromium only matches `:focus-visible` on a <button> when focus arrived via the keyboard,
 * so a bare `.focus()` would silently assert nothing. Stepping back and forward lands on the
 * same element through a real Tab, whatever precedes it in the document.
 */
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}

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
    const revealed = await skip.boundingBox();
    expect(revealed!.y).toBeGreaterThanOrEqual(0);
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

test.describe("nav dropdown keyboard traversal (issue #174, defect 2)", () => {
  test("opens from the keyboard, tabs through its links, and Escape returns focus", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation");
    const trigger = nav.getByRole("button", { name: "Calc" });
    await focusByKeyboard(page, trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Plain links in a real browser's tab order — the traversal the disclosure promises.
    // The old `role="menu"`/`role="menuitem"` markup promised arrow keys instead, and had
    // no arrow-key handling at all.
    for (const name of ["Calc", "Simulator", "Armor Damage", "Armor Effectiveness"]) {
      await page.keyboard.press("Tab");
      await expect(nav.getByRole("link", { name, exact: true })).toBeFocused();
    }

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("exposes no ARIA menu roles", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Calc" }).click();
    await expect(nav.getByRole("link", { name: "Simulator" })).toBeVisible();

    expect(await page.getByRole("menu").count()).toBe(0);
    expect(await page.getByRole("menuitem").count()).toBe(0);
  });
});

test.describe("raw buttons paint the design system's focus ring (issue #174, defect 3)", () => {
  test("the /data tab strip and column-sort headers show a ring on keyboard focus", async ({
    page,
  }) => {
    await page.goto("/data", { waitUntil: "networkidle" });

    // Neither of these can honestly be a <Button>: one is a tab strip, the other lives
    // inside a <th>. Both now carry the shared `focusRing`.
    const tab = page.getByRole("button", { name: "ARMOR", exact: true });
    await focusByKeyboard(page, tab);
    const tabStyles = await tab.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
    });
    // `focus-visible:outline-none` removes the UA indicator, so the ring is the ONLY thing
    // left. Asserting both together is the point: half of this pair is worse than neither.
    expect(tabStyles.outlineStyle).toBe("none");
    expect(tabStyles.boxShadow).not.toBe("none");
    expect(tabStyles.boxShadow).not.toBe("");

    const sortHeader = page.getByRole("button", { name: /^Name/ }).first();
    await focusByKeyboard(page, sortHeader);
    const sortStyles = await sortHeader.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
    });
    expect(sortStyles.outlineStyle).toBe("none");
    expect(sortStyles.boxShadow).not.toBe("none");
  });
});
