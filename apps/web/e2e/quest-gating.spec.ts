import type { Page } from "@playwright/test";
import { test, expect } from "./upstream.js";
import { openProgression, pickWeapon, progressionPanel } from "./builder-helpers.js";

/**
 * Quest gating (#224), on the captures. Peacekeeper sells the Magpul PRS GEN3 stock at LL3
 * once "I Need More Power" is done; nothing else sells it. The M4A1's default preset fits a
 * Colt carbine buffer tube, whose stock slot takes it.
 *
 * Basic mode assumes the quests gating an offer at the profile's loyalty level are done and
 * marks the item; advanced mode asks for the quest, which the profile editor lists among the
 * captures' three quests that gate gear.
 */

const PROFILE_KEY = "tg:player-profile";
const PRS = "AR-15 Magpul PRS GEN3 stock (Black)";
const LL4 = {
  prapor: 4,
  therapist: 4,
  skier: 4,
  peacekeeper: 4,
  mechanic: 4,
  ragman: 4,
  jaeger: 4,
};

test.use({ playerProfile: "fresh" });

async function seedProfile(page: Page, mode: "basic" | "advanced"): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    PROFILE_KEY,
    JSON.stringify({ mode, traders: LL4, flea: false, level: 40 }),
  ] as const);
}

async function openBufferTubeStockSlot(page: Page) {
  await pickWeapon(page);
  // The buffer tube's own stock slot sits inside the collapsed stock slot.
  await page.locator('details[data-slot-path="mod_stock"] > summary').click();
  const slot = page.locator('details[data-slot-path="mod_stock/mod_stock_000"]');
  await slot.locator(":scope > summary").click();
  return slot.getByRole("button", { name: new RegExp(PRS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
}

test.describe("quest gating", () => {
  test("basic mode assumes the quest at the offer's loyalty level and says so", async ({
    page,
  }) => {
    await seedProfile(page, "basic");
    await page.goto("/builder");

    const option = await openBufferTubeStockSlot(page);
    const pill = option.getByText("LL3 · quest");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("title", "Assumes I Need More Power is complete");
    await expect(option.getByText("Locked")).toHaveCount(0);

    await openProgression(page);
    await progressionPanel(page).getByText("Edit profile").click();
    await expect(
      page.getByText(
        "Basic checks trader loyalty only. A quest-locked trader offer counts as unlocked once you reach its loyalty level.",
      ),
    ).toBeVisible();
  });

  test("advanced mode locks it on the quest, and ticking the quest unlocks it", async ({
    page,
  }) => {
    await seedProfile(page, "advanced");
    await page.goto("/builder");

    const option = await openBufferTubeStockSlot(page);
    await expect(option.getByText("Locked")).toBeVisible();
    await expect(option.getByText("Quest: I Need More Power")).toBeVisible();

    await openProgression(page);
    await progressionPanel(page).getByText("Edit profile").click();
    // The captures hold three quests that gate gear, and the editor lists exactly those.
    await expect(page.getByText("— 0 of 3 complete")).toBeVisible();
    const quests = page.locator("ul").filter({ has: page.getByLabel("I Need More Power") });
    await expect(quests.getByRole("checkbox")).toHaveCount(3);

    await page.getByLabel("I Need More Power").check();
    await expect(page.getByText("— 1 of 3 complete")).toBeVisible();
    await expect(option.getByText("LL3", { exact: true })).toBeVisible();
    await expect(option.getByText("Locked")).toHaveCount(0);
  });
});
