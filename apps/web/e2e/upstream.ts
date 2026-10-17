/**
 * The e2e suite's network boundary: fixtures in, live third parties out.
 *
 * Every spec imports `test` from here instead of `@playwright/test`. The overridden `page`
 * fixture installs a default-DENY egress policy on the browser context:
 *
 *   - `json.tarkov.dev` is answered from the committed captures (see `upstream-fixtures.ts`).
 *   - `assets.tarkov.dev` gets a 1×1 stub image. `WeaponSilhouette` hides itself in its
 *     `onError` handler (`packages/ui/src/components/weapon-silhouette.tsx:48`), so a CDN
 *     outage would otherwise turn "the silhouette rendered" into a failing assertion.
 *   - Google Fonts is allowed through, deliberately — see ALLOWED_LIVE_HOSTS below.
 *   - Anything else is aborted AND recorded, and a non-empty record fails the test.
 *
 * That last rule is the point. The suite used to depend on `json.tarkov.dev` being up
 * (issue #175) purely because nothing ever said it shouldn't; a new live dependency added
 * tomorrow now fails loudly at the commit that adds it, naming the URL, instead of quietly
 * putting a third party back on the pre-merge gate.
 *
 * Specs registering their own `page.route` still win: Playwright matches handlers in reverse
 * registration order, so a route added inside a test is consulted before this one.
 */
import { test as base, expect } from "@playwright/test";
import type { PlayerProfile } from "@tarkov/data";
import { upstreamFixtureBody } from "./upstream-fixtures.js";

/**
 * Hosts the browser may still reach for real.
 *
 * Google Fonts stays live because three smoke tests assert that Bungee / Chivo / Azeret Mono
 * actually LOAD — that contract is the `<link>` in `apps/web/index.html` resolving against
 * Google's CDN, and serving a local stub instead would leave those tests asserting the stub.
 * The risk being removed by this module is a community-run JSON API that was down for over a
 * month; fonts.googleapis.com is not in that class.
 */
const ALLOWED_LIVE_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/** The item-image CDN. Answered with a stub rather than blocked — see the module comment. */
const ASSET_HOST = "assets.tarkov.dev";

/** The host the shipped bundle fetches game data from (`apps/web/src/tarkov-client.ts:12`). */
const UPSTREAM_HOST = "json.tarkov.dev";

/** A decodable 1×1 transparent PNG. Content type, not the `.webp` URL, drives decoding. */
const STUB_IMAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** The key `useProgression` persists the profile to — `packages/tarkov-data/src/hooks/useProgression.ts`. */
const PROFILE_STORAGE_KEY = "tg:player-profile";

/**
 * The profile the suite runs as by default.
 *
 * A stored profile puts `/builder` in progression mode (`resolveMode` in `useProgression.ts`),
 * where the weapon picker lists only weapons available on the player's profile, and on
 * `DEFAULT_PROFILE` — level 1, every trader LL1, no flea —
 * only the PM is reachable (through its default preset, Prapor LL1); the M4A1's cheapest
 * gate is a Peacekeeper LL2 preset barter. A fresh profile would therefore leave the Builder
 * specs on the wrong weapon.
 *
 * A progressed profile also puts the specs on the weapon the captures were built around: the
 * M4A1, whose captured parts reach four slot levels deep (a barrel's muzzle device's own muzzle
 * slot), which is what the slot-tree and optimizer specs need to be exercising. Availability gating is still live — it is simply being driven from a
 * state that makes the fixture's own content reachable.
 *
 * `test.use({ playerProfile: "fresh" })` opts a spec out: nothing is stored, so the Builder
 * opens in theorycraft, as a first visit does. `builder-mode.spec.ts` and
 * `builder-profile.spec.ts` do, because their subject IS that starting state.
 */
export const PROGRESSED_PROFILE: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 4, skier: 4, peacekeeper: 4, mechanic: 4, ragman: 4, jaeger: 4 },
  flea: true,
  level: 40,
};

/**
 * How many slots `min-recoil` changes on a bare M4A1, over the captured document, on
 * {@link PROGRESSED_PROFILE}: pistol grip, charging handle, stock and its nested stock slot,
 * receiver, and under the receiver its barrel and handguard — under the barrel its gas block,
 * muzzle device and that device's own muzzle slot; under the handguard its nested handguard and
 * that one's foregrip. Nothing that does not lower recoil is added: a tie goes to the cheaper
 * build, and then to the one with fewer parts.
 *
 * Deterministic, because all three inputs are — which is the point. The specs used to
 * `test.skip` when the solver found nothing, and against live data that skip could fire on
 * any given day, so "the optimizer proposes changes" was never actually asserted.
 *
 * If this number moves, the captures or the solver moved. Read the diff before retuning it.
 */
export const OPTIMIZER_CHANGED_SLOTS = 12;

/**
 * The same for `max-accuracy`: pistol grip, charging handle, stock and its nested stock slot,
 * receiver, and under it the barrel with its gas block and muzzle device, and the handguard.
 */
export const OPTIMIZER_ACCURACY_CHANGED_SLOTS = 9;

/**
 * The RCL % cell for the strongest mod that run proposes — a -0.24 `recoilModifier` rendered
 * as a percent by `mod-changes-table.tsx`. Uses U+2212, as that formatter does.
 */
export const STRONGEST_OPTIMIZED_RECOIL_CELL = "−24.0";

export type PlayerProfileSeed = "progressed" | "fresh";

export const test = base.extend<{ playerProfile: PlayerProfileSeed }>({
  playerProfile: ["progressed", { option: true }],

  // Playwright names this second parameter `use` in its own docs; it is called `runTest` here
  // because `react-hooks/rules-of-hooks` reads a bare `use(...)` call as the React hook of the
  // same name and rejects it outside a component. Nothing else about the fixture changes.
  page: async ({ page, playerProfile }, runTest) => {
    if (playerProfile === "progressed") {
      await page.addInitScript(
        ([key, value]) => {
          window.localStorage.setItem(key, value);
        },
        [PROFILE_STORAGE_KEY, JSON.stringify(PROGRESSED_PROFILE)] as const,
      );
    }

    const escaped: string[] = [];

    await page.route(
      (url) => url.hostname !== "127.0.0.1" && url.hostname !== "localhost",
      async (route) => {
        const url = new URL(route.request().url());

        if (url.hostname === UPSTREAM_HOST) {
          const body = upstreamFixtureBody(url.pathname.split("/").pop() ?? "");
          if (body === null) {
            escaped.push(`${url.href} (no capture for this resource)`);
            await route.abort("blockedbyclient");
            return;
          }
          await route.fulfill({
            status: 200,
            headers: { "content-type": "application/json" },
            body,
          });
          return;
        }

        if (url.hostname === ASSET_HOST) {
          await route.fulfill({
            status: 200,
            headers: { "content-type": "image/png" },
            body: STUB_IMAGE,
          });
          return;
        }

        if (ALLOWED_LIVE_HOSTS.has(url.hostname)) {
          await route.continue();
          return;
        }

        escaped.push(`${route.request().method()} ${url.href}`);
        await route.abort("blockedbyclient");
      },
    );

    await runTest(page);

    expect(
      escaped,
      "The page reached a live third party. The pre-merge gate must fail on our code, never " +
        "on someone else's uptime — serve it from a fixture in apps/web/e2e/upstream.ts, or " +
        "add the host to ALLOWED_LIVE_HOSTS with a reason.",
    ).toEqual([]);
  },
});

export { expect };
