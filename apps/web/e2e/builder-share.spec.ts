import type { Page, Route } from "@playwright/test";
import { test, expect, expectNoLiveThirdParty, installUpstreamBoundary } from "./upstream.js";
import { capturedItemName } from "./upstream-fixtures.js";

/**
 * Share links: what a reader opens is the build that was shared.
 *
 * The round trip goes through the real stack (the Pages Function, the builds-api Worker and its
 * KV) and makes the suite's one build write per run. builds-api admits 20 writes per IP per UTC
 * day, and the suite's other writes are two pairs in `smoke.spec.ts`.
 *
 * The older versions are served by `page.route`. Shared builds live in KV with no expiry, so a
 * v3, v4 or v5 record written years ago must still open with every part, its name and its
 * author's progression.
 */

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_LABEL = "Colt M4A1 5.56x45 assault rifle";
const MOE_GRIP = "55802f5d4bdc2dac148b458f";
const MOE_GRIP_NAME = "AR-15 Magpul MOE pistol grip (Black)";
const PMAG = "55802d5f4bdc2dac148b458e";
const PMAG_NAME = "AR-15 5.56x45 Magpul PMAG 30 GEN M3 W STANAG 30-round magazine";

/** The captured SOPMOD II preset's parts: nineteen, nested five slots deep. */
const SOPMOD_II: Readonly<Record<string, string>> = {
  mod_pistol_grip: "5a339805c4a2826c6e06d73d",
  mod_magazine: PMAG,
  mod_reciever: "55d355e64bdc2d962f8b4569",
  "mod_reciever/mod_scope": "57aca93d2459771f2c7e26db",
  "mod_reciever/mod_barrel": "55d35ee94bdc2d61338b4568",
  "mod_reciever/mod_barrel/mod_muzzle": "56ea8180d2720bf2698b456a",
  "mod_reciever/mod_barrel/mod_muzzle/mod_muzzle": "57da93632459771cb65bf83f",
  "mod_reciever/mod_barrel/mod_gas_block": "56eabcd4d2720b66698b4574",
  "mod_reciever/mod_handguard": "55f84c3c4bdc2d5f408b4576",
  "mod_reciever/mod_handguard/mod_scope": "5649a2464bdc2d91118b45a8",
  "mod_reciever/mod_handguard/mod_scope/mod_scope": "58d39d3d86f77445bb794ae7",
  "mod_reciever/mod_handguard/mod_scope/mod_scope/mod_scope": "58d399e486f77442e0016fe7",
  "mod_reciever/mod_handguard/mod_tactical001": "544909bb4bdc2d6f028b4577",
  "mod_reciever/mod_handguard/mod_handguard": "638f1ff84822287cad04be9d",
  "mod_reciever/mod_handguard/mod_handguard/mod_foregrip": "58c157be86f77403c74b2bb6",
  mod_stock: "5649be884bdc2d79388b4577",
  "mod_stock/mod_stock_000": "58d2946386f774496974c37e",
  "mod_stock/mod_stock_000/mod_stock": "58d2912286f7744e27117493",
  mod_charge: "55d44fd14bdc2d962f8b456e",
};
const SOPMOD_II_COUNT = Object.keys(SOPMOD_II).length;

const STATS = [
  "Ergonomics",
  "Vert. recoil",
  "Horiz. recoil",
  "Weight",
  "Accuracy",
  "Muzzle velocity",
  "Sighting range",
  "Capacity",
] as const;

function weaponPicker(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
}

function attached(page: Page, count: number) {
  return page.getByText(`${count} attached`, { exact: true });
}

/**
 * Each slot row's path and the name of the part fitted there, read from the row's own item
 * cell (`slot-tree.tsx`: the summary's third span, whose first child is the fitted part's
 * name). Rows with nothing fitted are left out.
 */
function fittedParts(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll<HTMLElement>("details[data-slot-path]")).flatMap((d) => {
        const name = d.querySelector(
          ":scope > summary > span:nth-of-type(3) > span:first-child:not(.italic)",
        )?.textContent;
        return name ? [[d.dataset.slotPath ?? "", name]] : [];
      }),
    ),
  );
}

/** Every Spec stat the panel shows, label to value. */
async function stats(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const label of STATS) {
    out[label] = await page
      .locator("dl > div")
      .filter({ has: page.locator("dt").getByText(label, { exact: true }) })
      .locator("dd")
      .first()
      .innerText();
  }
  return out;
}

/** Each slot row's path and what its summary says is fitted there. */
function slotRows(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll<HTMLElement>("details[data-slot-path]")).map((d) => [
        d.dataset.slotPath ?? "",
        d.querySelector(":scope > summary")?.textContent ?? "",
      ]),
    ),
  );
}

async function fitPart(page: Page, slotPath: string, name: string) {
  const slot = page.locator(`[data-slot-path="${slotPath}"]`);
  await slot.locator("> summary").click();
  await slot.getByRole("button", { name }).first().click();
  await expect(slot.locator("> summary")).toContainText(name);
}

function serve(page: Page, id: string, body: unknown) {
  return page.route(`**/api/builds/${id}`, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

test.describe("Builder share links", () => {
  test("a shared build opens in a fresh browser with the same weapon, parts and stats", async ({
    page,
    browser,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await weaponPicker(page).selectOption({ label: M4A1_LABEL });
    await expect(
      page.getByRole("group", { name: "Presets" }).getByRole("button", { name: /^M4A1 Carbine/ }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    await fitPart(page, "mod_pistol_grip", MOE_GRIP_NAME);
    await fitPart(page, "mod_magazine", PMAG_NAME);
    await expect(attached(page, 12)).toBeVisible();
    await page.getByPlaceholder("Build name (optional)").fill("Round trip");

    const sharedRows = await slotRows(page);
    const sharedStats = await stats(page);
    // What the reader must match is really on the page: the swapped parts, and a value for
    // every stat.
    expect(sharedRows.mod_pistol_grip).toContain(MOE_GRIP_NAME);
    expect(sharedRows.mod_magazine).toContain(PMAG_NAME);
    expect(Object.keys(sharedRows).length).toBeGreaterThan(12);
    for (const label of STATS) expect(sharedStats[label], label).toMatch(/\d/);

    const posted = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/builds",
    );
    await page.getByRole("button", { name: "Share build" }).click();
    const response = await posted;
    expect(response.status()).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(response.request().postDataJSON()).toMatchObject({
      version: 6,
      weaponId: M4A1,
      attachments: { mod_pistol_grip: MOE_GRIP, mod_magazine: PMAG },
      name: "Round trip",
    });
    await expect(page.getByText("Build URL copied")).toBeVisible();

    // A visitor with nothing stored: no draft, no profile, a first visit's theorycraft.
    const context = await browser.newContext();
    try {
      const reader = await context.newPage();
      const escaped = await installUpstreamBoundary(reader, "fresh");
      await reader.goto(`/builder/${id}`, { waitUntil: "networkidle" });

      await expect(attached(reader, 12)).toBeVisible({ timeout: 15_000 });
      await expect(weaponPicker(reader).locator("option:checked")).toHaveText(M4A1_LABEL);
      await expect(reader.getByPlaceholder("Build name (optional)")).toHaveValue("Round trip");
      expect(await slotRows(reader)).toEqual(sharedRows);
      expect(await stats(reader)).toEqual(sharedStats);
      expectNoLiveThirdParty(escaped);
    } finally {
      await context.close();
    }
  });

  const PROFILE = {
    mode: "advanced",
    traders: {
      prapor: 4,
      therapist: 4,
      skier: 4,
      peacekeeper: 4,
      mechanic: 4,
      ragman: 4,
      jaeger: 4,
    },
    flea: true,
  };

  for (const [version, id] of [
    [3, "abcd2373"],
    [4, "abcd2374"],
    [5, "abcd2375"],
  ] as const) {
    test(`a v${version} share link opens with every part, its name and its author's profile`, async ({
      page,
    }) => {
      await serve(page, id, {
        version,
        weaponId: M4A1,
        attachments: SOPMOD_II,
        orphaned: [],
        createdAt: "2026-01-15T00:00:00.000Z",
        // v3 predates names and descriptions, and every v3-v5 record predates `level`.
        ...(version >= 4 ? { name: `v${version} SOPMOD`, description: "Saved long ago" } : {}),
        // v5 renamed the Gunsmith quests; v3 and v4 records still carry the retired names.
        profileSnapshot: {
          ...PROFILE,
          completedQuests: [version === 5 ? "gunsmith-master-part-2" : "gunsmith-part-2"],
        },
      });
      await page.goto(`/builder/${id}`, { waitUntil: "networkidle" });

      await expect(attached(page, SOPMOD_II_COUNT)).toBeVisible({ timeout: 15_000 });
      await expect(weaponPicker(page).locator("option:checked")).toHaveText(M4A1_LABEL);
      await expect(page.getByText(/couldn't be placed on this weapon/)).toHaveCount(0);
      // Every part in the slot it was saved in, by name: a migration that moved or swapped
      // parts would still fit nineteen of them.
      expect(await fittedParts(page)).toEqual(
        Object.fromEntries(
          Object.entries(SOPMOD_II).map(([path, itemId]) => [path, capturedItemName(itemId)]),
        ),
      );
      await expect(page.getByPlaceholder("Build name (optional)")).toHaveValue(
        version >= 4 ? `v${version} SOPMOD` : "",
      );
      if (version >= 4) {
        await expect(page.getByPlaceholder("Description (optional)")).toHaveValue("Saved long ago");
      }

      // The author's profile arrives under the current quest names, level defaulted.
      await expect(
        page.getByText("This build was shared with a progression snapshot (advanced mode)."),
      ).toBeVisible();
      await page.getByRole("button", { name: "Use author's profile" }).click();
      const stored = () =>
        page.evaluate(
          () =>
            JSON.parse(window.localStorage.getItem("tg:player-profile") ?? "null") as {
              completedQuests?: string[];
              level?: number;
              traders: Record<string, number>;
            } | null,
        );
      await expect
        .poll(async () => (await stored())?.completedQuests)
        .toEqual(["gunsmith-master-part-2"]);
      const adopted = (await stored())!;
      expect(adopted.completedQuests).toEqual(["gunsmith-master-part-2"]);
      expect(adopted.traders).toEqual(PROFILE.traders);
      expect(adopted.level).toBe(1);
    });
  }
});
