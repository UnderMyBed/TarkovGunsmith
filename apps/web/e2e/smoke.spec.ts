import type { APIRequestContext, Page, ConsoleMessage } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { fixtureItemCount } from "./upstream-fixtures.js";
import fixtureProgression from "./fixtures/tarkovtracker-progression.json" with { type: "json" };

/**
 * Game data comes from the captured upstream documents, not live `json.tarkov.dev` — see
 * `upstream.ts`, which also blocks (and fails on) any other live third party the page reaches.
 * Google Fonts is the one deliberate exception, because the three font tests below assert
 * that the real `<link>` in `index.html` resolves.
 */

/** Placeholder option + one per weapon in the capture. `<option value="">Select weapon…</option>`. */
const WEAPON_OPTION_COUNT = fixtureItemCount("ItemPropertiesWeapon") + 1;

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

/**
 * `document.fonts.check()` reports whether a face is LOADED, and browsers only fetch a
 * webfont once an element actually uses it. `document.fonts.ready` resolves as soon as
 * nothing is pending — so if it is awaited before React has painted anything, no load is
 * pending, it resolves immediately, and check() answers false for a font that is perfectly
 * well configured.
 *
 * That is exactly what route code-splitting introduced: the entry chunk now loads, then
 * pulls the route chunk, so first paint lands later than it did from a single bundle. These
 * tests used a bare `page.goto("/")`, whose default `load` fires before React renders.
 *
 * Waiting for real painted content first restores what these tests were always asserting —
 * that the Google Fonts link is correct and unblocked — without depending on how the
 * bundler happens to chunk the app. Do not weaken these to `document.fonts.load()`: forcing
 * a fetch would pass even if nothing on the page used the font, which is the regression
 * the Bungee guard below exists to catch.
 */
async function gotoAndAwaitFonts(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "networkidle" });
  // A header element that uses the display + mono faces, so a real layout has happened.
  await page
    .getByRole("link", { name: /TARKOVGUNSMITH/i })
    .first()
    .waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.describe("smoke — design system", () => {
  test("Bungee display font actually loads (regression guard for the M3 Fonts bug)", async ({
    page,
  }) => {
    await gotoAndAwaitFonts(page);
    const bungeeLoaded = await page.evaluate(() => document.fonts.check("1em Bungee"));
    expect(
      bungeeLoaded,
      "Bungee didn't load. If this fires, the Google Fonts <link> in apps/web/index.html is probably wrong or blocked. M3 regressed on this exact bug — don't let it happen again.",
    ).toBe(true);
  });

  test("Chivo body font actually loads", async ({ page }) => {
    await gotoAndAwaitFonts(page);
    const loaded = await page.evaluate(() => document.fonts.check("1em Chivo"));
    expect(loaded).toBe(true);
  });

  test("Azeret Mono numeric font actually loads", async ({ page }) => {
    await gotoAndAwaitFonts(page);
    const loaded = await page.evaluate(() => document.fonts.check('1em "Azeret Mono"'));
    expect(loaded).toBe(true);
  });

  test("landing shows the optimizer promo strip + feature grid", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Try Optimizer", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("WHAT IT DOES", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("OPTIMIZER", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
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

    // Arc 4: weapon silhouette backdrop should render (CDN image on md:+).
    // Set viewport wide enough that the md: breakpoint applies (default Tailwind
    // md: is 768px).
    await page.setViewportSize({ width: 1200, height: 900 });
    const silhouette = page.locator("img[src*='-base-image.webp']");
    await expect(silhouette.first()).toBeVisible({ timeout: 5_000 });

    expect(
      errors,
      `Console errors on /builder after selecting a weapon:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
});

test.describe("smoke — /builder/compare/<pairId>", () => {
  // Requires the Pages Function at `apps/web/functions/api/pairs/[[path]].ts`
  // to be serving live — i.e. a `wrangler pages dev` webServer, which
  // `playwright.config.ts`'s webServer has used since #89. This was
  // previously skipped on a stale claim that the config still used `vite
  // preview` (which doesn't proxy `/api/*`); that stopped being true when the
  // webServer switched, and this test now passes end-to-end, including
  // through the builds-api schema-validation + rate-limit boundary added in
  // the pre-refactor hardening pass.
  test("seeds a pair via POST /api/pairs and loads it via deep link", async ({ page, request }) => {
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

    // Wait for the weapon list query to resolve. CompareSide lists every weapon in the
    // document rather than gating on the profile (compare-side.tsx:57), so the count is
    // exactly what the capture carries — a partially-parsed list fails here instead of
    // quietly leaving a shorter picker to pass a `> 2`.
    await expect
      .poll(async () => await leftPicker.locator("option").count(), { timeout: 15_000 })
      .toBe(WEAPON_OPTION_COUNT);

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
  // The label swap this asserts used to depend on the router finishing its transition.
  // `navigate()` only *starts* one: the URL flips to `/builder/compare/<pairId>` straight
  // away — which is what `waitForURL` below observes — while `builder.compare.tsx` keeps
  // rendering the pairId-less draft workspace until the child route's match commits, and
  // with `autoCodeSplitting` that window also covers fetching the child route's chunk.
  // `compare-workspace.tsx` now holds the id the store minted, so the toolbar flips as soon
  // as the pair exists rather than whenever the transition lands. See issue #163.
  test("fills both sides, saves, follows redirect, state matches", async ({ page }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });

    const leftPicker = page.locator("#compare-weapon-A");
    const rightPicker = page.locator("#compare-weapon-B");
    await expect(leftPicker).toBeVisible({ timeout: 10_000 });
    await expect(rightPicker).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => await leftPicker.locator("option").count(), { timeout: 15_000 })
      .toBe(WEAPON_OPTION_COUNT);

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

  // A well-formed-but-missing id gets the fallback card (above); a MALFORMED
  // id is a client error and is refused before any upstream call. `..%2F`
  // decodes to `../`, which would otherwise make
  // `${BUILDS_API_URL}/builds/../healthz` resolve to the Worker's /healthz.
  test("/og/build/<malformed id> is refused with 400", async ({ request }) => {
    const res = await request.get("/og/build/..%2Fhealthz");
    expect(res.status()).toBe(400);
    expect(await res.text()).toBe("Invalid id");
  });

  test("/og/pair/<malformed id> is refused with 400", async ({ request }) => {
    const res = await request.get("/og/pair/..%2Fhealthz");
    expect(res.status()).toBe(400);
    expect(await res.text()).toBe("Invalid id");
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

    // A plain link, not a `menuitem` — the dropdown is a disclosure containing navigation
    // links, not an ARIA menu. See the docblock on `features/nav/nav-dropdown.tsx`.
    const simLink = page.getByRole("navigation").getByRole("link", { name: "Simulator" });
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

test.describe("smoke — matrix accuracy disclosure", () => {
  // The single-layer model overstates shots-to-break by 4-17x on plate-equipped
  // vests (ADR-0003). Shipping that silently is not acceptable, so the caveat is
  // a tested contract rather than decoration. Delete this test only when
  // ADR-0003 is implemented and the caveat is no longer true.
  test("/matrix discloses that armor is modelled as a single layer", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/matrix", { waitUntil: "networkidle" });

    await expect(page.getByText(/Single-layer model/i)).toBeVisible();
    await expect(page.getByText(/far more durable than they are/i)).toBeVisible();
    await expect(page.getByText(/ADR-0003/)).toBeVisible();

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
