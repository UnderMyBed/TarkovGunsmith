// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OptimizeView } from "./optimize-view.js";
import type { PlayerProfile, WeaponTree, BuildV6 } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

afterEach(() => cleanup());

// Stub @tarkov/optimizer for deterministic result.
vi.mock("@tarkov/optimizer", () => ({
  optimize: () => ({
    ok: true,
    build: {
      version: 6,
      weaponId: "w1",
      attachments: { muzzle: "m-new", handguard: "h-new" },
      orphaned: [],
      createdAt: "2026-04-22T00:00:00Z",
    } satisfies BuildV6,
    stats: {
      ergonomics: 58,
      verticalRecoil: 120,
      horizontalRecoil: 260,
      weight: 3.1,
      accuracy: 2.2,
      modCount: 2,
    } as WeaponSpec,
    partial: false,
  }),
}));

const weapon = { id: "w1" } as unknown as BallisticWeapon;
const slotTree: WeaponTree = {
  weaponId: "w1",
  slots: [
    { path: "muzzle", name: "Muzzle", nameId: "muzzle", allowedItems: [] },
    { path: "handguard", name: "Handguard", nameId: "handguard", allowedItems: [] },
  ],
} as unknown as WeaponTree;
const profile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 3, skier: 3, peacekeeper: 2, mechanic: 3, ragman: 2, jaeger: 3 },
  flea: true,
  completedQuests: [],
};
const sync: UseTarkovTrackerSyncResult = {
  state: "disconnected",
  detail: { state: "disconnected" },
  connect: vi.fn(),
  reSync: vi.fn(),
  disconnect: vi.fn(),
};
const currentStats: WeaponSpec = {
  ergonomics: 50,
  verticalRecoil: 150,
  horizontalRecoil: 300,
  weight: 3.5,
  accuracy: 2.5,
  modCount: 1,
} as WeaponSpec;

describe("OptimizeView", () => {
  it("renders idle state with CURRENT filled and diff table idle message", () => {
    render(
      <OptimizeView
        weapon={weapon}
        slotTree={slotTree}
        modList={[]}
        profile={profile}
        sync={sync}
        currentAttachments={{ muzzle: "m-old" }}
        currentBuild={{
          version: 6,
          weaponId: "w1",
          attachments: { muzzle: "m-old" },
          orphaned: [],
          createdAt: "2026-04-22T00:00:00Z",
        }}
        currentStats={currentStats}
        currentPrice={10_000}
        onAccept={vi.fn()}
        onExit={vi.fn()}
        onEditProfile={vi.fn()}
      />,
    );
    expect(screen.getByText(/OPTIMIZER/)).toBeInTheDocument();
    expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
    // Current ergo populates the CURRENT card.
    expect(screen.getByTestId("triptych-current-ergo").textContent).toContain("50");
  });

  it("populates triptych and diff table after RUN OPTIMIZATION is clicked", async () => {
    render(
      <OptimizeView
        weapon={weapon}
        slotTree={slotTree}
        modList={[]}
        profile={profile}
        sync={sync}
        currentAttachments={{ muzzle: "m-old" }}
        currentBuild={{
          version: 6,
          weaponId: "w1",
          attachments: { muzzle: "m-old" },
          orphaned: [],
          createdAt: "2026-04-22T00:00:00Z",
        }}
        currentStats={currentStats}
        currentPrice={10_000}
        onAccept={vi.fn()}
        onExit={vi.fn()}
        onEditProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }));
    // The result state is set on the next microtask; wait one tick.
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(await screen.findByTestId("triptych-optimized-ergo")).toHaveTextContent("58");
  });

  it("calls onAccept with merged build when ACCEPT SELECTED fires with 1 row unchecked", async () => {
    const onAccept = vi.fn();
    render(
      <OptimizeView
        weapon={weapon}
        slotTree={slotTree}
        modList={[]}
        profile={profile}
        sync={sync}
        currentAttachments={{ muzzle: "m-old", handguard: "h-old" }}
        currentBuild={{
          version: 6,
          weaponId: "w1",
          attachments: { muzzle: "m-old", handguard: "h-old" },
          orphaned: [],
          createdAt: "2026-04-22T00:00:00Z",
        }}
        currentStats={currentStats}
        currentPrice={10_000}
        onAccept={onAccept}
        onExit={vi.fn()}
        onEditProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }));
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    // Proposal changes both muzzle and handguard (m-new / h-new vs m-old / h-old).
    // Uncheck handguard row — expect merged build to keep h-old.
    // Synchronise on the settled selection before interacting. OptimizeView defaults every
    // changed row to selected from an effect that lands a tick AFTER the rows first render —
    // at the moment the checkbox becomes queryable the button still reads "ACCEPT SELECTED (0)".
    // Clicking inside that window toggles against an empty set and the effect then clobbers the
    // click back to all-selected, so the assertion below looks for "(1)" and finds "(2)". That
    // is why this test failed roughly half the time in CI while passing every local run.
    // Waiting for "(2)" makes the uncheck mean what the test name says it means.
    await screen.findByRole("button", { name: /ACCEPT SELECTED \(2\)/ });
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept HANDGUARD/i }));
    fireEvent.click(await screen.findByRole("button", { name: /ACCEPT SELECTED \(1\)/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const acceptedBuild = onAccept.mock.calls[0][0] as BuildV6;
    expect(acceptedBuild.attachments).toEqual({ muzzle: "m-new", handguard: "h-old" });
  });
});
