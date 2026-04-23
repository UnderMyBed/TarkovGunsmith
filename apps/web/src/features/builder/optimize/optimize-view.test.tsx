// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OptimizeView } from "./optimize-view.js";
import type { PlayerProfile, WeaponTree, BuildV4 } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

afterEach(() => cleanup());

// Stub @tarkov/optimizer for deterministic result.
vi.mock("@tarkov/optimizer", () => ({
  optimize: () => ({
    ok: true,
    build: {
      version: 4,
      weaponId: "w1",
      attachments: { muzzle: "m-new", handguard: "h-new" },
      orphaned: [],
      createdAt: "2026-04-22T00:00:00Z",
    } satisfies BuildV4,
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
} as PlayerProfile;
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
          version: 4,
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
          version: 4,
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
    // Two buttons match /Run optimization/i — pick the form's primary one (index 0).
    fireEvent.click(screen.getAllByRole("button", { name: /Run optimization/i })[0]);
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
          version: 4,
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
    // Two buttons match /Run optimization/i — pick the form's primary one (index 0).
    fireEvent.click(screen.getAllByRole("button", { name: /Run optimization/i })[0]);
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    // Proposal changes both muzzle and handguard (m-new / h-new vs m-old / h-old).
    // Uncheck handguard row — expect merged build to keep h-old.
    const handguardBox = await screen.findByRole("checkbox", { name: /Accept HANDGUARD/i });
    fireEvent.click(handguardBox);
    fireEvent.click(screen.getByRole("button", { name: /ACCEPT SELECTED \(1\)/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const acceptedBuild = onAccept.mock.calls[0][0] as BuildV4;
    expect(acceptedBuild.attachments).toEqual({ muzzle: "m-new", handguard: "h-old" });
  });
});
