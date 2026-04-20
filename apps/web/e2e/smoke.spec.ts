import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/** Every route we ship today. Keep in sync with __root.tsx nav. */
const ROUTES: ReadonlyArray<{
  path: string;
  /** Text we expect on the loaded page. */ contains: string;
}> = [
  { path: "/", contains: "BUILD THE" },
  { path: "/builder", contains: "NO WEAPON SELECTED" },
  { path: "/calc", contains: "Ballistic" },
  { path: "/matrix", contains: "AmmoVsArmor" },
  { path: "/sim", contains: "Ballistics" },
  { path: "/adc", contains: "Armor Damage" },
  { path: "/aec", contains: "Armor Effectiveness" },
  { path: "/data", contains: "Data" },
  { path: "/charts", contains: "Effectiveness" },
];

/**
 * Attach a console-error listener that fails the test on any `error`-level
 * message during the page's lifetime. Record every error so the failure
 * message is helpful.
 */
function captureConsoleErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return { errors };
}

test.describe("smoke — per-route load", () => {
  for (const route of ROUTES) {
    test(`${route.path} loads without console errors`, async ({ page }) => {
      const { errors } = captureConsoleErrors(page);
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.getByText(route.contains, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
      expect(errors, `Console errors on ${route.path}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});

test.describe("smoke — design system", () => {
  test("Bungee display font actually loads (regression guard for the M3 Fonts bug)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const bungeeLoaded = await page.evaluate(() => document.fonts.check("1em Bungee"));
    expect(
      bungeeLoaded,
      "Bungee didn't load. If this fires, the Google Fonts <link> in apps/web/index.html is probably wrong or blocked. M3 regressed on this exact bug — don't let it happen again.",
    ).toBe(true);
  });

  test("Chivo body font actually loads", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const loaded = await page.evaluate(() => document.fonts.check("1em Chivo"));
    expect(loaded).toBe(true);
  });

  test("Azeret Mono numeric font actually loads", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const loaded = await page.evaluate(() => document.fonts.check('1em "Azeret Mono"'));
    expect(loaded).toBe(true);
  });
});

test.describe("smoke — builder interaction", () => {
  /**
   * Regression guard for the reported Builder runtime error: selecting a
   * weapon should not throw, crash the tree, or surface a console error.
   * Picks the first real option in the Weapon <select> and waits for the
   * Mods card (which only renders once tree.data is loaded).
   */
  test("selecting a weapon renders the slot tree without errors", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });

    // Find the Weapon dropdown. The label text "Weapon" is unique on /builder.
    const select = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("Select weapon")') })
      .first();
    await expect(select).toBeVisible({ timeout: 15_000 });

    // Wait until the weapon list has loaded (more than just the placeholder).
    await expect
      .poll(async () => (await select.locator("option").count()) > 1, {
        timeout: 15_000,
      })
      .toBe(true);

    // Grab the second option (first real weapon; index 0 is the placeholder).
    const firstWeaponValue = await select.locator("option").nth(1).getAttribute("value");
    expect(firstWeaponValue, "expected at least one weapon option").toBeTruthy();
    await select.selectOption(firstWeaponValue);

    // After selection the Mods card appears with "Loading slot tree…" then the
    // tree. Assert one of the downstream elements renders without the page
    // throwing a console error along the way.
    await expect(page.getByText(/Mods|slot tree/i).first()).toBeVisible({ timeout: 20_000 });

    expect(
      errors,
      `Console errors on /builder after selecting a weapon:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
});
