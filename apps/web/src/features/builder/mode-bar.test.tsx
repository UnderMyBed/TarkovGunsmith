// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  DEFAULT_PROFILE,
  FLEA_UNLOCK_LEVEL,
  useProgression,
  type PlayerProfile,
  type TaskListItem,
} from "@tarkov/data";
import { ModeBar } from "./mode-bar.js";
import { applySyncedProfile } from "./synced-profile.js";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";

const PROFILE_KEY = "tg:player-profile";
const MODE_KEY = "tg:builder-mode";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** The profile the harness last rendered with. */
function latestProfile(): PlayerProfile {
  return JSON.parse(screen.getByTestId("profile").textContent ?? "") as PlayerProfile;
}

/**
 * The bar over the real `useProgression` and `useTarkovTrackerSync`, wired as `BuilderPage`
 * wires them, so what it sets is what persists.
 */
function Harness({ tasks = [] }: { tasks?: TaskListItem[] }) {
  const progression = useProgression();
  const sync = useTarkovTrackerSync({
    profile: progression.profile,
    onChange: (next, cause) => applySyncedProfile(progression, next, cause),
    tasks,
  });
  return (
    <>
      <span data-testid="mode">{progression.mode}</span>
      <span data-testid="profile">{JSON.stringify(progression.profile)}</span>
      <ModeBar progression={progression} sync={sync} />
    </>
  );
}

const pressed = (name: string) => screen.getByRole("button", { name, pressed: true });

/** Open the import popover, paste a token and connect, then let the fetch settle. */
async function importToken(token: string) {
  fireEvent.click(screen.getByRole("button", { name: /Import from TarkovTracker/ }));
  fireEvent.change(screen.getByPlaceholderText(/token/i), { target: { value: token } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Connect/ }));
    await Promise.resolve();
  });
}

describe("ModeBar on a first visit", () => {
  it("prompts, in theorycraft, to set a progression", () => {
    render(<Harness />);
    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.getByText("Set your progression")).toBeInTheDocument();
    expect(pressed("Theorycraft")).toBeInTheDocument();
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      expect(screen.getByRole("button", { name: ll })).toBeInTheDocument();
    }
  });

  it("sets an LL2 profile in one click and switches to progression", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "LL2" }));

    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
    expect(screen.queryByText("Set your progression")).not.toBeInTheDocument();
    expect(pressed("Progression")).toBeInTheDocument();
    expect(latestProfile().traders.peacekeeper).toBe(2);
    expect(latestProfile()).toMatchObject({ flea: true, level: FLEA_UNLOCK_LEVEL });
    expect(window.localStorage.getItem(MODE_KEY)).toBe("progression");
  });

  it("applies a TarkovTracker import only once it succeeds, in advanced mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tasksProgress: [],
            taskObjectivesProgress: [],
            hideoutModulesProgress: [],
            hideoutPartsProgress: [],
            displayName: "SyncUser",
            userId: "sync",
            playerLevel: 30,
            gameEdition: 1,
            pmcFaction: "USEC",
          }),
          { status: 200 },
        ),
      ),
    );
    render(<Harness />);
    await importToken("tok-123");

    await screen.findByText("progression");
    expect(latestProfile()).toMatchObject({ mode: "advanced", level: 30, flea: true });
  });

  it("leaves a first visit in theorycraft, with nothing stored, when the import fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    render(<Harness />);
    await importToken("bad-token");

    expect(await screen.findByText(/Token rejected/)).toBeInTheDocument();
    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.getByText("Set your progression")).toBeInTheDocument();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });
});

describe("ModeBar re-syncing a first import that failed", () => {
  // The captures' quest that gates the PRS stock (`quest-gating.spec.ts`), completed.
  const TASKS: TaskListItem[] = [
    {
      id: "5a03296886f774569778596a",
      name: "I Need More Power",
      normalizedName: "i-need-more-power",
      kappaRequired: false,
      trader: { normalizedName: "peacekeeper" },
    },
  ];
  const PROGRESSION = {
    tasksProgress: [{ id: "5a03296886f774569778596a", complete: true }],
    taskObjectivesProgress: [],
    hideoutModulesProgress: [],
    hideoutPartsProgress: [],
    displayName: "SyncUser",
    userId: "sync",
    playerLevel: 30,
    gameEdition: 1,
    pmcFaction: "USEC",
  };

  it("applies the re-sync as the first import: advanced, quests read, progression", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 429 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(PROGRESSION), { status: 200 })),
    );
    render(<Harness tasks={TASKS} />);
    await importToken("tok-123");
    expect(await screen.findByText(/rate-limiting/)).toBeInTheDocument();
    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Re-sync" }));
      await Promise.resolve();
    });

    await screen.findByText("progression");
    expect(latestProfile()).toMatchObject({
      mode: "advanced",
      completedQuests: ["i-need-more-power"],
      level: 30,
    });
    expect(window.localStorage.getItem(MODE_KEY)).toBe("progression");
  });
});

describe("ModeBar in theorycraft with a profile set", () => {
  const OWN: PlayerProfile = {
    ...DEFAULT_PROFILE,
    traders: {
      prapor: 4,
      therapist: 3,
      skier: 2,
      peacekeeper: 4,
      mechanic: 3,
      ragman: 2,
      jaeger: 1,
    },
    flea: true,
    level: 37,
  };

  it("offers the way back to it, never a one-click profile that would overwrite it", () => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(OWN));
    window.localStorage.setItem(MODE_KEY, "theorycraft");
    render(<Harness />);

    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.queryByText("Set your progression")).not.toBeInTheDocument();
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      expect(screen.queryByRole("button", { name: ll })).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Back to your progression" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
    expect(latestProfile()).toEqual(OWN);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!)).toEqual(OWN);
  });

  it("keeps the profile set by the one-click prompt when toggled back to theorycraft", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "LL3" }));
    fireEvent.click(screen.getByRole("button", { name: "Theorycraft" }));

    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.getByRole("button", { name: "Back to your progression" })).toBeInTheDocument();
    expect(latestProfile().traders.jaeger).toBe(3);
    expect(window.localStorage.getItem(MODE_KEY)).toBe("theorycraft");
  });
});
