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
  level: 20,
  completedQuests: [],
};

function sync(state: "disconnected" | "syncing" | "synced" | "error"): UseTarkovTrackerSyncResult {
  const detail =
    state === "synced"
      ? {
          state,
          lastSyncedAt: Date.now() - 2 * 3600_000,
          questCount: 50,
          questTotal: 71,
          playerLevel: 20,
        }
      : state === "error"
        ? { state, kind: "network" as const, message: "offline" }
        : { state };
  return {
    state,
    detail: detail,
    connect: vi.fn(),
    reSync: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("ProfileReadout", () => {
  it("shows MANUAL meta and disables RE-IMPORT when disconnected", () => {
    render(<ProfileReadout gate={profile} sync={sync("disconnected")} onEditProfile={vi.fn()} />);
    expect(screen.getByText(/Manual/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-import/ })).toBeDisabled();
  });

  it("shows TARKOVTRACKER · Nh AGO and enables RE-IMPORT when synced", () => {
    render(<ProfileReadout gate={profile} sync={sync("synced")} onEditProfile={vi.fn()} />);
    expect(screen.getByText(/TarkovTracker · 2h ago/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-import/ })).toBeEnabled();
  });

  it("calls sync.reSync when RE-IMPORT clicked", () => {
    const reSyncMock = vi.fn();
    const s = sync("synced");
    s.reSync = reSyncMock;
    render(<ProfileReadout gate={profile} sync={s} onEditProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Re-import/ }));
    expect(reSyncMock).toHaveBeenCalled();
  });

  it("calls onEditProfile when Edit profile link clicked", () => {
    const onEditProfile = vi.fn();
    render(
      <ProfileReadout gate={profile} sync={sync("disconnected")} onEditProfile={onEditProfile} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit profile/ }));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it("renders all 7 trader rows with level values", () => {
    render(<ProfileReadout gate={profile} sync={sync("disconnected")} onEditProfile={vi.fn()} />);
    expect(screen.getByText(/Prapor/)).toBeInTheDocument();
    expect(screen.getByText(/Jaeger/)).toBeInTheDocument();
  });

  it("names theorycraft, with every gate open, and offers to set a progression", () => {
    const onEditProfile = vi.fn();
    render(<ProfileReadout gate={null} sync={sync("synced")} onEditProfile={onEditProfile} />);
    expect(screen.getByText("Theorycraft")).toBeInTheDocument();
    expect(screen.getByText(/Every trader, flea offer and quest open/i)).toBeInTheDocument();
    expect(screen.queryByText("PMC level")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-import/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Set progression/ }));
    expect(onEditProfile).toHaveBeenCalledOnce();
  });
});
