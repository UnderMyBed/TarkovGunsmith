import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type ConsoleMessage,
} from "@playwright/test";
import fixtureProgression from "./fixtures/tarkovtracker-progression.json" with { type: "json" };

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
  { path: "/builder/compare", contains: "Add a second build" },
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

    // Fail loudly on GraphQL / network errors rendered as card text. The recent
    // WeaponTree parse-error bug surfaced here, not in the console.
    await expect(
      page.getByText(/couldn.?t load slot tree|failed to load|graphql error/i),
    ).toHaveCount(0);

    expect(
      errors,
      `Console errors on /builder after selecting a weapon:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
});

test.describe("smoke — /builder/compare/<pairId>", () => {
  // Requires the Pages Function at `apps/web/functions/api/pairs/[[path]].ts`
  // to be serving live — i.e. a `wrangler pages dev` webServer. The Playwright
  // config uses `vite preview`, which only serves the SPA bundle and falls
  // back to index.html for unknown paths, so `POST /api/pairs` returns the
  // SPA's HTML rather than the downstream builds-api Worker. Skip until the
  // webServer gains `pages:dev`; the flow is already covered by pairsApi unit
  // tests + the builds-api integration suite.
  test.skip("seeds a pair via POST /api/pairs and loads it via deep link", async ({
    page,
    request,
  }) => {
    const seed = {
      v: 1,
      createdAt: new Date().toISOString(),
      left: null,
      right: null,
      name: "smoke-pair",
    };
    const res = await request.post("/api/pairs", { data: seed });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { id: string };
    const { errors } = captureConsoleErrors(page);
    await page.goto(`/builder/compare/${body.id}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /save/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    expect(errors, `Console errors on /builder/compare/${body.id}:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});

test.describe("smoke — compare interaction", () => {
  test("selecting two different weapons shows stat deltas", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/builder/compare", { waitUntil: "networkidle" });

    // Each CompareSide renders a <select id="compare-weapon-A|B"> for the
    // weapon picker. Target both directly by id to avoid coupling to DOM
    // order.
    const leftPicker = page.locator("#compare-weapon-A");
    const rightPicker = page.locator("#compare-weapon-B");
    await expect(leftPicker).toBeVisible({ timeout: 10_000 });
    await expect(rightPicker).toBeVisible({ timeout: 10_000 });

    // Wait for the weapon list query to resolve (>2 options means the
    // placeholder plus at least two real weapons).
    await expect
      .poll(async () => await leftPicker.locator("option").count(), { timeout: 15_000 })
      .toBeGreaterThan(2);

    // Grab two distinct real-weapon values (index 0 is the placeholder).
    const leftValue = await leftPicker.locator("option").nth(1).getAttribute("value");
    const rightValue = await rightPicker.locator("option").nth(2).getAttribute("value");
    expect(leftValue, "expected at least one weapon option").toBeTruthy();
    expect(rightValue, "expected at least two weapon options").toBeTruthy();
    expect(leftValue).not.toBe(rightValue);

    await leftPicker.selectOption(leftValue);
    await rightPicker.selectOption(rightValue);

    // Stat-delta strip renders `<span data-direction=...>` cells when both
    // sides have a spec. Wait for at least one to appear.
    const deltaCell = page.locator("[data-direction]").first();
    await expect(deltaCell).toBeVisible({ timeout: 15_000 });

    expect(errors, `Console errors on compare interaction:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("smoke — compare save round-trip", () => {
  // Same proxy caveat as /builder/compare/<pairId> seed-load above: the
  // "Save comparison" button hits `POST /api/pairs`, which the `vite preview`
  // webServer doesn't route to the Pages Function. Under `wrangler pages dev`
  // the flow works end-to-end; un-skip this when the Playwright webServer
  // gains proxy support.
  test.skip("fills both sides, saves, follows redirect, state matches", async ({ page }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });

    const leftPicker = page.locator("#compare-weapon-A");
    const rightPicker = page.locator("#compare-weapon-B");
    await expect(leftPicker).toBeVisible({ timeout: 10_000 });
    await expect(rightPicker).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => await leftPicker.locator("option").count(), { timeout: 15_000 })
      .toBeGreaterThan(2);

    const leftValue = await leftPicker.locator("option").nth(1).getAttribute("value");
    const rightValue = await rightPicker.locator("option").nth(2).getAttribute("value");
    expect(leftValue).toBeTruthy();
    expect(rightValue).toBeTruthy();

    await leftPicker.selectOption(leftValue);
    await rightPicker.selectOption(rightValue);

    await page.getByRole("button", { name: /save comparison/i }).click();

    // Redirect to /builder/compare/<pairId> (builds-api mints an 8-char id
    // from the `abcdefghjkmnpqrstuvwxyz23456789` alphabet).
    await page.waitForURL(/\/builder\/compare\/[abcdefghjkmnpqrstuvwxyz23456789]{8}$/, {
      timeout: 10_000,
    });

    // Once we have a pairId the Save button's label flips.
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.locator("[data-direction]").first()).toBeVisible();
  });
});

test.describe("smoke — OG cards", () => {
  // These id values must pass BUILD_ID_REGEX in apps/builds-api
  // (`^[abcdefghjkmnpqrstuvwxyz23456789]{8}$`) or the builds-api returns 400
  // Invalid id, and both the OG Pages Function and middleware treat the entity
  // as missing. The playwright.config.ts webServer seeds these same ids into
  // KV via `wrangler dev --var OG_FIXTURE_BUILD_ID:... --var OG_FIXTURE_PAIR_ID:...`.
  const FIXTURE_BUILD_ID = "abcd2345";
  const FIXTURE_PAIR_ID = "efgh6789";

  // The builds-api seeds fixtures on first request via `ctx.waitUntil`. Poking
  // `/healthz` triggers the seed; a small delay lets the KV put settle before
  // the Pages Function (or middleware) reads it.
  async function primeFixtures(request: APIRequestContext) {
    await request.get("http://127.0.0.1:8787/healthz").catch(() => {});
    await new Promise((r) => setTimeout(r, 250));
  }

  test(`/og/build/${FIXTURE_BUILD_ID} returns a PNG`, async ({ request }) => {
    await primeFixtures(request);

    const res = await request.get(`/og/build/${FIXTURE_BUILD_ID}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    // The embedded fallback PNG is exactly 21,229 bytes. Real Satori-rendered
    // build cards come in around 33 KB for the seeded fixture. Threshold at
    // 25 KB so the fallback is rejected but there is generous headroom for
    // content variations — this assertion is what proves the GraphQL + render
    // path actually worked instead of silently falling back.
    expect(body.byteLength).toBeGreaterThan(25_000);
    expect(body[0]).toBe(0x89); // PNG magic
  });

  test(`/og/pair/${FIXTURE_PAIR_ID} returns a PNG`, async ({ request }) => {
    await primeFixtures(request);

    const res = await request.get(`/og/pair/${FIXTURE_PAIR_ID}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    // Same fallback-guard as the /og/build test above.
    expect(body.byteLength).toBeGreaterThan(25_000);
    expect(body[0]).toBe(0x89);
  });

  test("/og/build/<invalid> returns the fallback PNG", async ({ request }) => {
    // Use a well-formed id that isn't seeded — builds-api returns 404, OG
    // function returns the fallback card.
    const res = await request.get("/og/build/zzzzzzzz");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(5_000);
    expect(body[0]).toBe(0x89);
  });

  test(`/builder/${FIXTURE_BUILD_ID} HTML has OG meta`, async ({ request }) => {
    await primeFixtures(request);

    const res = await request.get(`/builder/${FIXTURE_BUILD_ID}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(
      new RegExp(`<meta property="og:image"[^>]*\\/og\\/build\\/${FIXTURE_BUILD_ID}`),
    );
    expect(html).toMatch(/<meta property="og:type" content="article"/);
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
  });

  test(`/builder/compare/${FIXTURE_PAIR_ID} HTML has OG meta pointing at /og/pair`, async ({
    request,
  }) => {
    await primeFixtures(request);

    const res = await request.get(`/builder/compare/${FIXTURE_PAIR_ID}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(
      new RegExp(`<meta property="og:image"[^>]*\\/og\\/pair\\/${FIXTURE_PAIR_ID}`),
    );
  });
});

test.describe("smoke — build optimizer", () => {
  test("opens optimizer dialog, runs, sees result", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });

    // Pick a weapon. The ProfileEditor's trader-LL <select> elements render
    // above the Weapon card (inside a collapsed <details>), so `select.first()`
    // would resolve to a hidden element. Filter by the "Select weapon" option
    // the same way the builder-interaction smoke test does.
    const weaponPicker = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("Select weapon")') })
      .first();
    await expect(weaponPicker).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => await weaponPicker.locator("option").count(), { timeout: 15_000 })
      .toBeGreaterThan(1);
    const firstWeaponValue = await weaponPicker.locator("option").nth(1).getAttribute("value");
    expect(firstWeaponValue, "expected at least one weapon option").toBeTruthy();
    await weaponPicker.selectOption(firstWeaponValue);

    // Open optimizer.
    const optimizeBtn = page.getByRole("button", { name: /optimize/i });
    await expect(optimizeBtn).toBeVisible({ timeout: 10_000 });
    await optimizeBtn.click();

    // Run with default constraints.
    await page.getByRole("button", { name: /run optimization/i }).click();

    // Result tab shows either Accept (success/partial) or Adjust constraints (failure).
    await expect(
      page.getByRole("button", { name: /(accept|adjust constraints)/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    expect(errors, `Console errors on optimizer flow:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("smoke — TarkovTracker import", () => {
  test("pasting a fake token populates the sync banner with mapped quests", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);

    // Mock the upstream BEFORE any page interaction.
    await page.route("https://tarkovtracker.io/api/v2/progress", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fixtureProgression),
      }),
    );

    await page.goto("/builder", { waitUntil: "networkidle" });

    // Switch to Advanced mode.
    await page.getByRole("button", { name: /^Advanced$/ }).click();

    // Open the Connect popover.
    await page.getByRole("button", { name: /Connect TarkovTracker/i }).click();

    // Paste a fake token and submit.
    await page.getByPlaceholder("Paste token").fill("fake-token");
    await page.getByRole("button", { name: "Connect" }).last().click();

    // Banner should populate with the fixture's player level + a non-zero quest count.
    const banner = page.getByText(/TARKOVTRACKER · \d+ QUESTS · PMC LV 25/);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    expect(errors, `Console errors on TarkovTracker connect:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("smoke — Builder-focus nav + WIP banners", () => {
  test("Calc dropdown opens and navigates to /sim", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Calc", exact: true }).click();

    const simLink = page.getByRole("menuitem", { name: "Simulator" });
    await expect(simLink).toBeVisible({ timeout: 5_000 });

    await simLink.click();
    await expect(page).toHaveURL(/\/sim$/);

    expect(errors, `Console errors on dropdown navigation:\n${errors.join("\n")}`).toEqual([]);
  });

  test("/calc shows the WIP banner", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/calc", { waitUntil: "networkidle" });
    await expect(page.getByText(/Subject to change or removal/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("smoke — keyboard shortcut overlay", () => {
  test("? opens the overlay, Esc closes it", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    // The overlay is not visible on load.
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeHidden();

    // Press `?` (Shift+/).
    await page.keyboard.press("Shift+?");

    // Overlay appears with the shortcut list.
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible({
      timeout: 3_000,
    });
    await expect(page.getByText("Go to /builder")).toBeVisible();

    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeHidden();

    expect(errors, `Console errors on shortcut overlay:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("smoke — slot-tree keyboard nav", () => {
  test("ArrowDown moves focus to the next slot summary", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });

    // Find and wait for the weapon <select> (same pattern as builder-interaction
    // smoke tests — filter by the "Select weapon" placeholder option).
    const weaponPicker = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("Select weapon")') })
      .first();
    await expect(weaponPicker).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await weaponPicker.locator("option").count()) > 1, {
        timeout: 15_000,
      })
      .toBe(true);

    // Select the first real weapon (index 0 is the placeholder).
    const firstWeaponValue = await weaponPicker.locator("option").nth(1).getAttribute("value");
    expect(firstWeaponValue, "expected at least one weapon option").toBeTruthy();
    await weaponPicker.selectOption(firstWeaponValue);

    // Wait for the slot tree to render — at least two slot summaries must appear
    // so ArrowDown has somewhere to go.
    const summaries = page.locator("details[data-slot-path] > summary");
    await expect(summaries.first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => await summaries.count(), { timeout: 10_000 }).toBeGreaterThan(1);

    // Click the first summary to open its <details> panel. This makes the item
    // buttons inside the panel visible and focusable, which is required for
    // the keyboard handler to move focus to the next interactive target. With
    // the panel closed, the buttons are hidden and focus() on them is a no-op.
    await summaries.first().click();
    // Wait for the panel to open (the div inside <details> becomes visible).
    await expect(page.locator("details[data-slot-path]").first().locator("> div")).toBeVisible({
      timeout: 5_000,
    });

    // Re-focus the summary (clicking it may have shifted focus to a button inside).
    await summaries.first().focus();

    // Use locator.press() to fire ArrowDown directly on the first summary.
    // The keydown bubbles up to the <ul>'s onKeyDown handler which moves focus
    // to the next target in DOM order (the first visible button inside the open
    // panel, or the next summary if the panel is empty).
    await summaries.first().press("ArrowDown");

    // The active element should no longer be the first summary — the keyboard
    // handler moves focus to the next target in the tree.
    const activeIsFirst = await page.evaluate(() => {
      const summaryEls = Array.from(
        document.querySelectorAll<HTMLElement>("details[data-slot-path] > summary"),
      );
      const first = summaryEls[0];
      return document.activeElement === first;
    });
    expect(activeIsFirst, "ArrowDown should move focus away from the first slot summary").toBe(
      false,
    );

    expect(errors, `Console errors on slot-tree keyboard nav:\n${errors.join("\n")}`).toEqual([]);
  });
});
