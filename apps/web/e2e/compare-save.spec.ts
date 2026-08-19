import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end coverage for what a failed save on `/builder/compare` looks like.
 *
 * Before this, `compare-workspace.tsx` handed `save.mutate` an `onSuccess` and nothing
 * else, and `compare-toolbar.tsx` had no `isPending` / `error` prop at all: a rejected
 * POST produced no toast, no message and no state change — the button just did nothing,
 * and the user's only signal was that the page didn't move. The builds-api rejects real
 * writes (429 once an IP is past its daily limit, 413 over the body cap, 400 on a
 * schema-invalid payload), so this is a state users reach.
 *
 * The failure is injected at the network boundary with `page.route` rather than by
 * exhausting the Worker's real rate limiter, which is per-IP-per-UTC-day and would leak
 * across every other test sharing the webServer.
 */

/** Pick two different weapons so the draft is non-empty and dirty before saving. */
async function fillBothSides(page: Page): Promise<void> {
  const leftPicker = page.locator("#compare-weapon-A");
  const rightPicker = page.locator("#compare-weapon-B");
  await expect(leftPicker).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => await leftPicker.locator("option").count(), { timeout: 15_000 })
    .toBeGreaterThan(2);

  const leftValue = await leftPicker.locator("option").nth(1).getAttribute("value");
  const rightValue = await rightPicker.locator("option").nth(2).getAttribute("value");
  expect(leftValue).toBeTruthy();
  expect(rightValue).toBeTruthy();
  await leftPicker.selectOption(leftValue);
  await rightPicker.selectOption(rightValue);
}

test.describe("compare save failure", () => {
  test("surfaces a rejected save instead of silently doing nothing", async ({ page }) => {
    await page.route("**/api/pairs", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({ status: 429, body: "Rate limited" });
    });

    await page.goto("/builder/compare", { waitUntil: "networkidle" });
    await fillBothSides(page);

    await page.getByRole("button", { name: /save comparison/i }).click();

    // Curated copy for the status the Worker actually returns, not a generic failure.
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/save limit reached for today/i);

    // The draft is intact and still unsaved: same URL, same pairId-less toolbar.
    expect(new URL(page.url()).pathname).toBe("/builder/compare");
    await expect(page.getByRole("button", { name: /save comparison/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /save as new/i })).toHaveCount(0);
    await expect(page.locator("[data-direction]").first()).toBeVisible();
  });

  test("blocks a second submit while the save is in flight", async ({ page }) => {
    // Hold the POST open so the pending state is observable. Resolved at the end so the
    // page isn't torn down mid-request.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/pairs", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held;
      await route.fulfill({ status: 429, body: "Rate limited" });
    });

    await page.goto("/builder/compare", { waitUntil: "networkidle" });
    await fillBothSides(page);

    const saveButton = page.getByRole("button", { name: /save comparison/i });
    await saveButton.click();

    // Saving a comparison is a non-idempotent POST — a second click would mint a second
    // pair, so the control has to be unavailable until the first one settles.
    const savingButton = page.getByRole("button", { name: /saving/i });
    await expect(savingButton).toBeVisible({ timeout: 10_000 });
    await expect(savingButton).toBeDisabled();

    release();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  });
});
