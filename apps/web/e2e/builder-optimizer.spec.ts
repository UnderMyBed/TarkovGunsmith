import type { Page } from "@playwright/test";
import {
  test,
  expect,
  OPTIMIZER_ACCURACY_CHANGED_SLOTS,
  OPTIMIZER_CHANGED_SLOTS,
} from "./upstream.js";

/**
 * End-to-end coverage for the optimizer-first view.
 *
 * Runs against the captured upstream document (see `upstream.ts`), so the solver's output is
 * fixed rather than whatever upstream shipped that morning. The `test.skip("no improvements
 * in this solver run")` escape hatch these tests used to carry is gone with it: on this data
 * the solver always changes {@link OPTIMIZER_CHANGED_SLOTS} slots, and a run that changes
 * nothing is now a failure rather than a silent pass.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function pickFirstWeapon(page: Page): Promise<string | null> {
  // Several <select> elements render on /builder (profile trader-LL selects in
  // a collapsed <details> above). Filter to the one with the "Select weapon"
  // option so we hit the real weapon picker.
  const picker = page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Select weapon")') })
    .first();
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => await picker.locator("option").count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  const value = await picker.locator("option").nth(1).getAttribute("value");
  if (!value) return null;
  await picker.selectOption(value);
  await startEmpty(page);
  return value;
}

/** New builds start from the weapon's default preset; these tests build from an empty weapon. */
async function startEmpty(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Presets" })
    .getByRole("button", { name: /^Empty/ })
    .click();
  await expect(page.getByText("0 attached", { exact: true })).toBeVisible();
}

test.describe("builder optimizer diff view", () => {
  test("enter view, run, toggle a row, accept-selected merges correctly", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).toBeVisible();
    await expect(page.getByText(/RUN THE SOLVER/i)).toBeVisible();

    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    const changedRows = page.locator('[aria-label^="Accept "]');
    await expect
      .poll(async () => await changedRows.count(), { timeout: 15_000 })
      .toBe(OPTIMIZER_CHANGED_SLOTS);

    const acceptSelected = page.getByRole("button", { name: /ACCEPT SELECTED/ });
    const beforeLabel = await acceptSelected.textContent();
    const beforeN = parseInt((beforeLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    // Every changed row starts selected, so the counter is the row count until one is toggled.
    expect(beforeN).toBe(OPTIMIZER_CHANGED_SLOTS);

    await changedRows.first().click();
    const afterLabel = await acceptSelected.textContent();
    const afterN = parseInt((afterLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    expect(afterN).toBe(beforeN - 1);

    await acceptSelected.click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
  });

  for (const [objective, label, changed] of [
    ["min-recoil", "Min recoil", OPTIMIZER_CHANGED_SLOTS],
    ["max-accuracy", "Max accuracy", OPTIMIZER_ACCURACY_CHANGED_SLOTS],
  ] as const) {
    test(`${objective}: accepting every change gives a complete build with no conflict`, async ({
      page,
    }) => {
      await page.goto("/builder", { waitUntil: "networkidle" });
      const picked = await pickFirstWeapon(page);
      expect(
        picked,
        "the captured document must offer a weapon on the seeded profile",
      ).toBeTruthy();

      await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
      await page.getByRole("radio", { name: label }).check();
      await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();
      await expect
        .poll(async () => await page.locator('[aria-label^="Accept "]').count(), {
          timeout: 15_000,
        })
        .toBe(changed);

      await page.getByRole("button", { name: /ACCEPT ALL/ }).click();
      await expect(page).not.toHaveURL(/\?view=optimize/);
      await expect(page.getByText(`${changed} attached`, { exact: true })).toBeVisible();
      // The Builder flags a build with an empty required slot or two parts that clash.
      await expect(page.getByText(/^Incomplete · /)).toHaveCount(0);
      await expect(page.getByText(/^Conflict · /)).toHaveCount(0);
    });
  }

  test("a run can be cancelled, and the page answers while it runs", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    // On the captured data every solve finishes in milliseconds, so the run is held open by
    // holding the worker's script: the worker exists and the run is live until it is released.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let requested = 0;
    let served: Promise<void> = Promise.resolve();
    await page.route(/\/assets\/optimize\.worker-[^/]+\.js$/, (route) => {
      requested++;
      served = held.then(() => route.continue());
      return served;
    });

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();
    const running = page.getByRole("status", { name: "Optimizer running" });
    await expect(running).toBeVisible();
    // The worker's script is held, so the solver has not started: no clock yet.
    await expect(running).toContainText("Starting the solver · 0 candidate builds checked");
    await expect.poll(() => requested, { message: "the run starts a worker" }).toBe(1);
    await expect(page.getByText("RUNNING", { exact: true })).toBeVisible();

    // The main thread is free: a click during the run is handled.
    const ergonomics = page.getByRole("radio", { name: "Max ergonomics" });
    await ergonomics.check();
    await expect(ergonomics).toBeChecked();
    await expect(running).toBeVisible();

    await running.getByRole("button", { name: "CANCEL" }).click();
    await expect(running).toBeHidden();
    await expect(page.getByText("IDLE", { exact: true })).toBeVisible();
    await expect(page.getByText(/RUN THE SOLVER/i)).toBeVisible();

    // Serving the held script must not revive the cancelled run's view. This does not prove
    // a late reply is dropped (a reply would need longer than these checks wait); that
    // guarantee is covered in useOptimizer.test.ts.
    release();
    await served;
    await expect(page.getByText("IDLE", { exact: true })).toBeVisible();
    await expect(page.locator('[aria-label^="Accept "]')).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);

    // A new run, on the changed objective, does report.
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();
    await expect
      .poll(async () => await page.locator('[aria-label^="Accept "]').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(page.getByText(/^ERGO Δ · /)).toBeVisible();
  });

  test("a budget no build fits says so, and runs again without it", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    const budget = page.getByLabel("Budget");
    await expect(budget).toBeEnabled({ timeout: 15_000 });
    await budget.fill("1");
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    const outcome = page.getByRole("alert");
    await expect(outcome).toContainText("OVER BUDGET", { timeout: 15_000 });
    await expect(outcome).toContainText(/costs ₽[\d,]+, over the ₽1 budget\./);
    await expect(page.locator('[aria-label^="Accept "]')).toHaveCount(0);

    await outcome.getByRole("button", { name: "RUN WITHOUT A BUDGET" }).click();
    await expect(budget).toHaveValue("");
    await expect
      .poll(async () => await page.locator('[aria-label^="Accept "]').count(), { timeout: 15_000 })
      .toBe(OPTIMIZER_CHANGED_SLOTS);
    await expect(page.getByText(/^RECOIL V\+H Δ · −/)).toBeVisible();
  });

  test("a nested slot can be pinned, emptied with its parent, and is kept by the result", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picker = page
      .locator("select")
      .filter({ has: page.locator('option:has-text("Select weapon")') })
      .first();
    await expect
      .poll(async () => await picker.locator("option").count(), { timeout: 15_000 })
      .toBeGreaterThan(1);
    await picker.selectOption({ label: "Colt M4A1 5.56x45 assault rifle" });
    await expect(page.getByText(/^[1-9]\d* attached$/)).toBeVisible();
    // The SOPMOD II preset fills slots below optional ones; the default preset does not.
    const sopmod = page.getByRole("group", { name: "Presets" }).getByRole("button", {
      name: /^M4A1 SOPMOD II/,
    });
    await sopmod.click();
    await expect(sopmod).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    const tree = page.getByRole("list", { name: "Pinned slots" });
    await expect(page.getByText("Nothing pinned")).toBeVisible();

    // A nested slot that holds a part, under a slot that may be left empty: the pair the
    // emptying has to be shown on. The captured build must have one.
    const row = (path: string) => tree.locator(`li[data-slot-path="${path}"]`);
    const enabled = async (path: string, choice: string) =>
      await row(path).getByRole("radio", { name: choice }).isEnabled();
    const paths = await tree
      .locator("li[data-slot-path]")
      .evaluateAll((lis) => lis.map((li) => li.getAttribute("data-slot-path")!));
    let childPath: string | undefined;
    let parentPath: string | undefined;
    for (const path of paths.filter((p) => p.includes("/"))) {
      if (!(await enabled(path, "LOCK"))) continue;
      const segments = path.split("/");
      for (let i = segments.length - 1; i >= 1 && parentPath === undefined; i--) {
        const above = segments.slice(0, i).join("/");
        if (await enabled(above, "EMPTY")) parentPath = above;
      }
      if (parentPath !== undefined) {
        childPath = path;
        break;
      }
    }
    expect(
      childPath,
      "the SOPMOD II preset needs a filled slot below an optional one",
    ).toBeTruthy();
    const child = row(childPath!);
    const parent = row(parentPath!);
    const labelOf = async (path: string) =>
      ((await row(path).getByRole("radiogroup").getAttribute("aria-label")) ?? "").replace(
        / pin$/,
        "",
      );

    await child.getByRole("radio", { name: "LOCK" }).check({ force: true });
    await expect(page.getByText("1 slot pinned")).toBeVisible();

    // EMPTY asks first, then takes the nested lock with it, in view.
    await parent.getByRole("radio", { name: "EMPTY" }).click({ force: true });
    await expect(parent.getByRole("radio", { name: "EMPTY" })).not.toBeChecked();
    const ask = parent.getByRole("group", { name: `Empty ${await labelOf(parentPath!)}` });
    await expect(ask).toContainText("clears 1 pin below it.");
    await expect(child).toHaveCount(1);
    await ask.getByRole("button", { name: "EMPTY IT" }).click();
    await expect(child).toHaveCount(0);
    await expect(page.getByText("1 slot pinned")).toBeVisible();
    await parent.getByRole("radio", { name: "FREE" }).check({ force: true });
    await expect(child.getByRole("radio", { name: "FREE" })).toBeChecked();
    await expect(page.getByText("Nothing pinned")).toBeVisible();

    // Lock the child and every slot above it, so its path exists in every build the solver
    // may return.
    const segments = childPath!.split("/");
    const chain = segments.map((_, i) => segments.slice(0, i + 1).join("/"));
    for (const path of chain)
      await row(path).getByRole("radio", { name: "LOCK" }).check({ force: true });
    await expect(page.getByText(`${chain.length} slots pinned`)).toBeVisible();
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    const report = page.getByRole("region", { name: "Pins" });
    await expect(report).toContainText(`${chain.length} KEPT`, { timeout: 15_000 });
    const labels = await Promise.all(chain.map(labelOf));
    await expect(report.getByRole("listitem").filter({ hasText: /^KEPT/ })).toHaveText(
      labels.map((_, i) => new RegExp(`^KEPT${escape(labels.slice(0, i + 1).join(" › "))}`)),
    );
  });

  test("← EDITOR discards and returns to editor without merging", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);

    await page.getByRole("button", { name: /Back to builder editor/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).not.toBeVisible();
  });
});
