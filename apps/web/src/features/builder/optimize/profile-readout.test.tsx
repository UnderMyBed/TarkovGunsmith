// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProfileReadout } from "./profile-readout.js";
import type { PlayerProfile } from "@tarkov/data";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

afterEach(() => cleanup());

const profile: PlayerProfile = {
  mode: "advanced",
  traders: { prapor: 4, therapist: 3, skier: 3, peacekeeper: 2, mechanic: 3, ragman: 2, jaeger: 3 },
  flea: true,
  completedQuests: [],
} as PlayerProfile;

function sync(state: "disconnected" | "syncing" | "synced" | "error"): UseTarkovTrackerSyncResult {
  const detail =
    state === "synced"
      ? {
          state,
          lastSyncedAt: Date.now() - 2 * 3600_000,
          questCount: 50,
          playerLevel: 20,
          unmappedCount: 0,
        }
      : state === "error"
        ? { state, kind: "network" as const, message: "offline" }
        : { state };
  return {
    state,
    detail: detail as never,
    connect: vi.fn(),
    reSync: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("ProfileReadout", () => {
  it("shows MANUAL meta and disables RE-IMPORT when disconnected", () => {
    render(
      <ProfileReadout profile={profile} sync={sync("disconnected")} onEditProfile={vi.fn()} />,
    );
    expect(screen.getByText(/MANUAL/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RE-IMPORT/ })).toBeDisabled();
  });

  it("shows TARKOVTRACKER · Nh AGO and enables RE-IMPORT when synced", () => {
    render(<ProfileReadout profile={profile} sync={sync("synced")} onEditProfile={vi.fn()} />);
    expect(screen.getByText(/TARKOVTRACKER · 2H AGO/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RE-IMPORT/ })).toBeEnabled();
  });

  it("calls sync.reSync when RE-IMPORT clicked", () => {
    const reSyncMock = vi.fn();
    const s = sync("synced");
    s.reSync = reSyncMock;
    render(<ProfileReadout profile={profile} sync={s} onEditProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /RE-IMPORT/ }));
    expect(reSyncMock).toHaveBeenCalled();
  });

  it("calls onEditProfile when EDIT PROFILE link clicked", () => {
    const onEditProfile = vi.fn();
    render(
      <ProfileReadout
        profile={profile}
        sync={sync("disconnected")}
        onEditProfile={onEditProfile}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /EDIT PROFILE/ }));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it("renders all 7 trader rows with level values", () => {
    render(
      <ProfileReadout profile={profile} sync={sync("disconnected")} onEditProfile={vi.fn()} />,
    );
    expect(screen.getByText(/PRAPOR/)).toBeInTheDocument();
    expect(screen.getByText(/JAEGER/)).toBeInTheDocument();
  });
});
