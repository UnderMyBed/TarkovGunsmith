import type { Page } from "@playwright/test";
import {
  test,
  expect,
  OPTIMIZER_ACCURACY_CHANGED_SLOTS,
  OPTIMIZER_CHANGED_SLOTS,
} from "./upstream.js";
import {
  choosePreset,
  expectPreset,
  pickFirstWeapon as pickFirst,
  pickWeapon,
  slotRow,
} from "./builder-helpers.js";

/**
 * End-to-end coverage for the workbench's optimize mode: the proposal shown as a diff in the
 * slot tree, ticked per row, applied or discarded from the Proposal card.
 *
 * Runs against the captured upstream document (see `upstream.ts`), so the solver's output is
 * fixed rather than whatever upstream shipped that morning: on this data the solver always
 * changes {@link OPTIMIZER_CHANGED_SLOTS} slots, and a run that changes nothing is a failure
 * rather than a silent pass.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function pickFirstWeapon(page: Page): Promise<string | null> {
  const name = await pickFirst(page);
  await startEmpty(page);
  return name || null;
}

/** New builds start from the weapon's default preset; these tests build from an empty weapon. */
async function startEmpty(page: Page): Promise<void> {
  await choosePreset(page, /^Empty/);
  await expect(attached(page, 0)).toBeVisible();
}

function attached(page: Page, count: number) {
  return page.getByText(`${count} attached`, { exact: true });
}

/** The tree's rows the proposal changes: the checkable ones. */
function changedRows(page: Page) {
  return page.getByRole("tree", { name: "Slots" }).locator('[role="treeitem"][aria-checked]');
}

async function openOptimizer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Optimize", exact: true }).click();
  await expect(page).toHaveURL(/\?view=optimize/);
  await expect(page.getByRole("complementary", { name: "Optimizer" })).toBeVisible();
}

async function runAndWait(page: Page, changed: number): Promise<void> {
  await page.getByRole("button", { name: /^Run( again)?$/ }).click();
  await expect.poll(async () => await changedRows(page).count(), { timeout: 15_000 }).toBe(changed);
}

const proposal = (page: Page) => page.getByRole("region", { name: "Proposal" });

/** How many slots `min-recoil` changes on the M4A1 Carbine preset, over the captured document. */
const OPTIMIZER_CARBINE_CHANGED_SLOTS = 12;

/**
 * The changes still ticked after unticking that proposal's barrel: the barrel takes its gas
 * block and the suppressor below it, and the handguard (with its lower handguard and that one's
 * foregrip) goes too, because the new handguard clashes with the old barrel's gas block.
 */
const OPTIMIZER_CARBINE_KEPT_WITHOUT_BARREL = 6;

/**
 * The parts on the build those six changes make: the Carbine preset's 12, less the magazine,
 * the rear sight and the old stock's buttstock the changes take off, plus the new stock's.
 */
const OPTIMIZER_CARBINE_ATTACHED_WITHOUT_BARREL = 10;

test.describe("builder optimize mode", () => {
  test("run, untick a change by keyboard, apply the rest; the build shares and survives a reload", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await openOptimizer(page);
    await expect(page.getByText("Ready to run")).toBeVisible();
    await runAndWait(page, OPTIMIZER_CHANGED_SLOTS);

    // Every change starts ticked, and the strip shows the proposal against the current build.
    await expect(proposal(page)).toContainText(
      `${OPTIMIZER_CHANGED_SLOTS} of ${OPTIMIZER_CHANGED_SLOTS} ticked`,
    );
    await expect(proposal(page)).toContainText(/Vertical recoil [\d.]+ → [\d.]+/);
    await expect(page.getByRole("region", { name: "Build stats, proposed" })).toBeVisible();
    await expect(page.getByText("Showing the proposal")).toBeVisible();
    await expect(page.getByText("Exact", { exact: true })).toBeVisible();

    // A change at the top level with nothing under it: unticking it takes no other part along.
    const row = changedRows(page)
      .and(page.locator('[aria-level="1"]:not([aria-expanded])'))
      .first();
    await row.focus();
    await page.keyboard.press("Space");
    await expect(row).toHaveAttribute("aria-checked", "false");
    const kept = OPTIMIZER_CHANGED_SLOTS - 1;
    await expect(proposal(page)).toContainText(`${kept} of ${OPTIMIZER_CHANGED_SLOTS} ticked`);
    await expect(
      page.getByText(`Partial: ${kept} of ${OPTIMIZER_CHANGED_SLOTS} changes`),
    ).toBeVisible();

    await proposal(page).getByRole("button", { name: "Apply ticked changes" }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(attached(page, kept)).toBeVisible();

    // The applied build is the build: Share sends it, and a reload restores it from the draft.
    let shared: { attachments: Record<string, string> } | null = null;
    await page.route("**/api/builds", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      shared = route.request().postDataJSON() as typeof shared;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "abcd2400", url: "/api/builds/abcd2400" }),
      });
    });
    await page.getByRole("button", { name: "Share build" }).click();
    await expect(page.getByText("Build URL copied")).toBeVisible();
    await expect(page.getByText(/\/builder\/abcd2400$/)).toBeVisible();
    expect(Object.keys(shared!.attachments)).toHaveLength(kept);

    await page.reload({ waitUntil: "networkidle" });
    await expect(attached(page, kept)).toBeVisible({ timeout: 15_000 });
  });

  for (const [objective, label, changed] of [
    ["min-recoil", "Min recoil", OPTIMIZER_CHANGED_SLOTS],
    ["max-accuracy", "Max accuracy", OPTIMIZER_ACCURACY_CHANGED_SLOTS],
  ] as const) {
    test(`${objective}: applying every change gives a complete build with no conflict`, async ({
      page,
    }) => {
      await page.goto("/builder", { waitUntil: "networkidle" });
      const picked = await pickFirstWeapon(page);
      expect(
        picked,
        "the captured document must offer a weapon on the seeded profile",
      ).toBeTruthy();

      await openOptimizer(page);
      await page.getByRole("radio", { name: label }).check();
      await runAndWait(page, changed);

      await proposal(page).getByRole("button", { name: "Apply ticked changes" }).click();
      await expect(page).not.toHaveURL(/\?view=optimize/);
      await expect(attached(page, changed)).toBeVisible();
      // The Builder flags a build with an empty required slot or two parts that clash.
      await expect(page.getByText(/^Incomplete · /)).toHaveCount(0);
      await expect(page.getByText(/^Conflict · /)).toHaveCount(0);
    });
  }

  test("unticking a change that clears a conflict unticks what needs it, so Apply has no conflict", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await choosePreset(page, /Carbine/);
    await expectPreset(page, /Carbine/);

    // On the captured data the proposal swaps the barrel and the handguard, and each new part
    // clashes with an old one the other change takes off: the new A2 barrel with the old M4
    // handguard, the new RIS II handguard with the old barrel's front-sight gas block.
    await openOptimizer(page);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(proposal(page)).toContainText(
      `${OPTIMIZER_CARBINE_CHANGED_SLOTS} of ${OPTIMIZER_CARBINE_CHANGED_SLOTS} ticked`,
      { timeout: 15_000 },
    );
    const barrel = slotRow(page, "mod_reciever/mod_barrel");
    const handguard = slotRow(page, "mod_reciever/mod_handguard");
    await expect(barrel).toHaveAttribute("aria-label", /makes room for the new Handguard/);

    await barrel.focus();
    await page.keyboard.press("Space");
    await expect(barrel).toHaveAttribute("aria-checked", "false");
    await expect(handguard).toHaveAttribute("aria-checked", "false");
    await expect(handguard).toHaveAttribute(
      "aria-label",
      /conflicts with M4A1 front sight with gas block/,
    );
    await expect(proposal(page)).toContainText(
      `${OPTIMIZER_CARBINE_KEPT_WITHOUT_BARREL} of ${OPTIMIZER_CARBINE_CHANGED_SLOTS} ticked`,
    );

    await proposal(page).getByRole("button", { name: "Apply ticked changes" }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(attached(page, OPTIMIZER_CARBINE_ATTACHED_WITHOUT_BARREL)).toBeVisible();
    await expect(page.getByText(/^Conflict · /)).toHaveCount(0);
    await expect(page.getByText(/^Incomplete · /)).toHaveCount(0);
  });

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

    await openOptimizer(page);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const running = page.getByRole("status", { name: "Optimizer running" });
    await expect(running).toBeVisible();
    // The worker's script is held, so the solver has not started: no clock yet.
    await expect(running).toContainText("Starting the solver · 0 candidate builds checked");
    await expect.poll(() => requested, { message: "the run starts a worker" }).toBe(1);
    await expect(page.getByText("Solving…", { exact: true })).toBeVisible();

    // The main thread is free: a click during the run is handled.
    const ergonomics = page.getByRole("radio", { name: "Max ergonomics" });
    await ergonomics.check();
    await expect(ergonomics).toBeChecked();
    await expect(running).toBeVisible();

    await running.getByRole("button", { name: "Cancel" }).click();
    await expect(running).toBeHidden();
    await expect(page.getByText("Ready to run", { exact: true })).toBeVisible();

    // Serving the held script must not revive the cancelled run. This does not prove a late
    // reply is dropped (a reply would need longer than these checks wait); that guarantee is
    // covered in useOptimizer.test.ts.
    release();
    await served;
    await expect(page.getByText("Ready to run", { exact: true })).toBeVisible();
    await expect(changedRows(page)).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);

    // A new run, on the changed objective, does report.
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect
      .poll(async () => await changedRows(page).count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(proposal(page)).toContainText(/Ergonomics [\d.]+ → [\d.]+/);
  });

  test("a budget no build fits says so, and runs again without it", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await openOptimizer(page);
    const budget = page.getByLabel("Budget");
    await expect(budget).toBeEnabled({ timeout: 15_000 });
    await budget.fill("1");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    const outcome = page.getByRole("alert");
    await expect(outcome).toContainText("Over budget", { timeout: 15_000 });
    await expect(outcome).toContainText(/costs ₽[\d,]+, over the ₽1 budget\./);
    await expect(changedRows(page)).toHaveCount(0);

    await outcome.getByRole("button", { name: "Run without a budget" }).click();
    await expect(budget).toHaveValue("");
    await expect
      .poll(async () => await changedRows(page).count(), { timeout: 15_000 })
      .toBe(OPTIMIZER_CHANGED_SLOTS);
    await expect(proposal(page)).toContainText(/Vertical recoil [\d.]+ → [\d.]+/);
  });

  test("a nested slot can be pinned by key or click, emptied with its parent, and is kept by the result", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    await pickWeapon(page);
    await expect(page.getByText(/^[1-9]\d* attached$/)).toBeVisible();
    // The SOPMOD II preset fills slots below optional ones; the default preset does not.
    await choosePreset(page, /^M4A1 SOPMOD II/);
    await expectPreset(page, /^M4A1 SOPMOD II/);

    await openOptimizer(page);
    const panel = page.getByRole("region", { name: "Build with proposed changes" });
    await expect(panel.getByText("Nothing pinned")).toBeVisible();

    // A nested slot that holds a part, under a slot that may be left empty: the pair the
    // emptying has to be shown on. The captured build must have one.
    const pinButton = (path: string, name: string) =>
      slotRow(page, path).getByRole("button", { name, exact: true });
    const enabled = async (path: string, name: string) =>
      (await pinButton(path, name).count()) > 0 && (await pinButton(path, name).isEnabled());
    const paths = await page
      .getByRole("tree", { name: "Slots" })
      .locator("[role=treeitem][data-slot-path]")
      .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-slot-path")!));
    let childPath: string | undefined;
    let parentPath: string | undefined;
    for (const path of paths.filter((p) => p.includes("/"))) {
      if (!(await enabled(path, "Lock"))) continue;
      const segments = path.split("/");
      for (let i = segments.length - 1; i >= 1 && parentPath === undefined; i--) {
        const above = segments.slice(0, i).join("/");
        if (await enabled(above, "Keep empty")) parentPath = above;
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
    const child = slotRow(page, childPath!);
    const parent = slotRow(page, parentPath!);
    const labelOf = async (path: string) =>
      ((await slotRow(page, path).getByRole("group").getAttribute("aria-label")) ?? "").replace(
        /^Pin /,
        "",
      );

    // L on the focused row locks it; a key with Ctrl held is left to the browser.
    await child.focus();
    await page.keyboard.press("Control+l");
    await expect(pinButton(childPath!, "Lock")).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("l");
    await expect(pinButton(childPath!, "Lock")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByText("1 locked")).toBeVisible();

    // Keep empty asks first, then takes the nested lock with it, in view.
    await pinButton(parentPath!, "Keep empty").click();
    await expect(pinButton(parentPath!, "Keep empty")).toHaveAttribute("aria-pressed", "false");
    const ask = page.getByRole("group", { name: `Empty ${await labelOf(parentPath!)}` });
    await expect(ask).toContainText("clears 1 pin below it.");
    await expect(ask.getByRole("button", { name: "Empty it" })).toBeFocused();
    await expect(child).toHaveCount(1);
    await ask.getByRole("button", { name: "Empty it" }).click();
    await expect(child).toHaveCount(0);
    await expect(parent).toBeFocused();
    await expect(panel.getByText("1 kept empty")).toBeVisible();
    await page.keyboard.press("f");
    await expect(pinButton(childPath!, "Free")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByText("Nothing pinned")).toBeVisible();

    // Lock the child and every slot above it, so its path exists in every build the solver
    // may return.
    const segments = childPath!.split("/");
    const chain = segments.map((_, i) => segments.slice(0, i + 1).join("/"));
    for (const path of chain) await pinButton(path, "Lock").click();
    await expect(panel.getByText(`${chain.length} locked`)).toBeVisible();
    await page.getByRole("button", { name: "Run", exact: true }).click();

    const report = page.getByRole("region", { name: "Pins" });
    await expect(report).toContainText(`${chain.length} kept`, { timeout: 15_000 });
    const labels = await Promise.all(chain.map(labelOf));
    await expect(report.getByRole("listitem").filter({ hasText: /^Kept/ })).toHaveText(
      labels.map((_, i) => new RegExp(`^Kept${escape(labels.slice(0, i + 1).join(" › "))}`)),
    );
  });

  test("Discard drops the proposal and returns to the editor without changing the build", async ({
    page,
  }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await openOptimizer(page);
    await runAndWait(page, OPTIMIZER_CHANGED_SLOTS);
    await proposal(page).getByRole("button", { name: "Discard" }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(attached(page, 0)).toBeVisible();
  });

  test("Close leaves optimize mode without a run", async ({ page }) => {
    await page.goto("/builder", { waitUntil: "networkidle" });
    const picked = await pickFirstWeapon(page);
    expect(picked, "the captured document must offer a weapon on the seeded profile").toBeTruthy();

    await openOptimizer(page);
    await page.getByRole("button", { name: "Close the optimizer" }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("complementary", { name: "Optimizer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Optimize", exact: true })).toBeVisible();
  });
});
