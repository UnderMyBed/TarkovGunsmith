// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, renderHook, render, screen } from "@testing-library/react";
import type { PlayerProfile, TaskListItem } from "@tarkov/data";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";
import { TarkovTrackerSyncBanner } from "./tarkovtracker-sync-banner.js";

const STORAGE_KEY = "tg:tarkovtracker-token";

const profile: PlayerProfile = {
  mode: "advanced",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: false,
  completedQuests: [],
};

function renderSync() {
  return renderHook(() =>
    useTarkovTrackerSync({ profile, onChange: vi.fn(), tasks: [] as never[] }),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useTarkovTrackerSync initial state", () => {
  it("starts disconnected when no token is stored", () => {
    const { result } = renderSync();
    expect(result.current.state).toBe("disconnected");
  });

  it("starts connected when a token is already stored in this browser", () => {
    // The regression: the initializer used to read the stored token and then return
    // `{ state: "disconnected" }` from BOTH ternary branches, so a returning visitor who
    // had already connected was shown the Connect button again — with Re-sync and
    // Disconnect unreachable — while their token sat in localStorage the whole time.
    localStorage.setItem(STORAGE_KEY, "tt-token");
    const { result } = renderSync();
    expect(result.current.state).toBe("connected");
    expect(result.current.detail).toEqual({ state: "connected" });
  });

  it("does not fetch on mount — re-syncing stays an explicit user action", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    localStorage.setItem(STORAGE_KEY, "tt-token");
    renderSync();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns to disconnected once the token is cleared", () => {
    localStorage.setItem(STORAGE_KEY, "tt-token");
    const { result } = renderSync();
    act(() => result.current.disconnect());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.state).toBe("disconnected");
  });
});

describe("TarkovTrackerSyncBanner — connected", () => {
  it("offers Re-sync and Disconnect instead of claiming nothing is connected", () => {
    localStorage.setItem(STORAGE_KEY, "tt-token");
    const { result } = renderSync();
    render(<TarkovTrackerSyncBanner sync={result.current} />);

    expect(screen.getByText(/TARKOVTRACKER · CONNECTED/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-sync" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });
});

describe("useTarkovTrackerSync — the quest list loads after the progression", () => {
  const progression = {
    tasksProgress: [
      { id: "5a03296886f774569778596a", complete: true },
      { id: "5936d90786f7742b1420ba5b", complete: true },
    ],
    taskObjectivesProgress: [],
    hideoutModulesProgress: [],
    hideoutPartsProgress: [],
    displayName: "SyncUser",
    userId: "sync",
    playerLevel: 30,
    gameEdition: 1,
    pmcFaction: "USEC",
  };
  const tasks: TaskListItem[] = [
    {
      id: "5a03296886f774569778596a",
      name: "I Need More Power",
      normalizedName: "i-need-more-power",
      kappaRequired: true,
      trader: { normalizedName: "peacekeeper" },
    },
  ];

  afterEach(() => vi.unstubAllGlobals());

  it("waits in syncing, then finishes once the tasks arrive instead of sticking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(progression), { status: 200 })),
    );
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ list }: { list: TaskListItem[] | undefined }) =>
        useTarkovTrackerSync({ profile, onChange, tasks: list }),
      { initialProps: { list: undefined as TaskListItem[] | undefined } },
    );

    await act(() => result.current.connect("tt-token"));
    expect(result.current.state).toBe("syncing");
    expect(onChange).not.toHaveBeenCalled();

    rerender({ list: tasks });
    expect(result.current.detail).toMatchObject({
      state: "synced",
      questCount: 1,
      questTotal: 1,
      playerLevel: 30,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({
      completedQuests: ["i-need-more-power"],
      level: 30,
      flea: true,
    });

    // A later task-list change does not replay the finished sync.
    rerender({ list: [...tasks] });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
