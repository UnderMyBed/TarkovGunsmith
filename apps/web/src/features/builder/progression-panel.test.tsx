// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useId, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  DEFAULT_PROFILE,
  FLEA_UNLOCK_LEVEL,
  useProgression,
  type PlayerProfile,
  type TaskListItem,
} from "@tarkov/data";
import { ModeSwitch } from "./mode-switch.js";
import { ProgressionPanel, ProgressionStatus } from "./progression-panel.js";
import { applySyncedProfile } from "./synced-profile.js";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";

// The profile editor has its own tests (`profile-editor.test.tsx`) and reads the quest list
// through the data provider; here it is only something the panel holds.
vi.mock("./profile-editor.js", () => ({
  ProfileEditor: ({ sync }: { sync: { reSync: () => Promise<void> } }) => (
    <>
      <p>Profile editor</p>
      <button type="button" onClick={() => void sync.reSync()}>
        Editor re-sync
      </button>
    </>
  ),
}));

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
 * The mode switch, the progression lines and the progression panel over the real
 * `useProgression` and `useTarkovTrackerSync`, wired as `BuilderPage` wires them, so what they
 * set is what persists.
 */
function Harness({ tasks = [] }: { tasks?: TaskListItem[] | null }) {
  const progression = useProgression();
  const sync = useTarkovTrackerSync({
    profile: progression.profile,
    onChange: (next, cause) => applySyncedProfile(progression, next, cause),
    // `null`: the quest list is still loading.
    tasks: tasks ?? undefined,
  });
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const busyId = sync.state === "syncing" ? noteId : undefined;
  return (
    <>
      <span data-testid="mode">{progression.mode}</span>
      <span data-testid="profile">{JSON.stringify(progression.profile)}</span>
      <ModeSwitch progression={progression} onOpenPanel={() => setOpen(true)} busyId={busyId} />
      <ProgressionStatus
        progression={progression}
        sync={sync}
        onOpenPanel={() => setOpen(true)}
        busyId={busyId}
      />
      <ProgressionPanel
        open={open}
        onClose={() => setOpen(false)}
        progression={progression}
        sync={sync}
        busyId={busyId}
      />
    </>
  );
}

const panel = () => screen.getByRole("dialog", { name: "Your progression" });
const openPanel = () => fireEvent.click(screen.getByRole("button", { name: "My progression…" }));

const pressed = (name: string) => screen.getByRole("button", { name, pressed: true });

/** Open the panel's import popover, paste a token and connect, then let the fetch settle. */
async function importToken(token: string) {
  openPanel();
  fireEvent.click(within(panel()).getByRole("button", { name: /Import from TarkovTracker/ }));
  fireEvent.change(screen.getByPlaceholderText(/token/i), { target: { value: token } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Connect/ }));
    await Promise.resolve();
  });
}

describe("the progression controls on a first visit", () => {
  it("prompt, in theorycraft, to set a progression, and the panel offers one-click profiles", () => {
    render(<Harness />);
    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.getByText("Set your progression.")).toBeInTheDocument();
    expect(pressed("Theorycraft")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // "My progression…" sets nothing on its own: with no profile it opens the panel.
    openPanel();
    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      expect(within(panel()).getByRole("button", { name: ll })).toBeInTheDocument();
    }
    fireEvent.click(within(panel()).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The prompt's own button opens it too.
    fireEvent.click(screen.getByRole("button", { name: "Set progression…" }));
    expect(panel()).toBeInTheDocument();
  });

  it("sets an LL2 profile in one click, switches to progression and closes the panel", () => {
    render(<Harness />);
    openPanel();
    fireEvent.click(within(panel()).getByRole("button", { name: "LL2" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
    expect(screen.queryByText("Set your progression.")).not.toBeInTheDocument();
    expect(pressed("My progression…")).toBeInTheDocument();
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
    expect(screen.getByText("Set your progression.")).toBeInTheDocument();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });
});

describe("the progression controls re-syncing a first import that failed", () => {
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

describe("the progression controls while a sync is in flight", () => {
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

  /** Every control that could set a profile or a mode is disabled, and says why. */
  function expectLocked({ panelOpen }: { panelOpen: boolean }) {
    const controls = [
      ...["Theorycraft", "My progression…", "Set progression…"].map((name) =>
        screen.getByRole("button", { name }),
      ),
      ...(panelOpen
        ? [
            ...["LL1", "LL2", "LL3", "LL4"].map((name) =>
              within(panel()).getByRole("button", { name }),
            ),
            within(panel()).getByRole("button", { name: /Import from TarkovTracker/ }),
          ]
        : []),
    ];
    for (const control of controls) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription("Importing from TarkovTracker…");
    }
  }

  it("locks the controls through a re-sync with no profile, then applies it as the first import", async () => {
    window.localStorage.setItem("tg:tarkovtracker-token", "tok-123");
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    render(<Harness tasks={TASKS} />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Re-sync" }));
    expectLocked({ panelOpen: true });
    // A click on a locked one-click profile does nothing.
    fireEvent.click(within(panel()).getByRole("button", { name: "LL3" }));
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();

    await act(async () => {
      answer(new Response(JSON.stringify(PROGRESSION), { status: 200 }));
      await Promise.resolve();
    });
    await screen.findByText("progression");
    expect(latestProfile()).toMatchObject({
      mode: "advanced",
      completedQuests: ["i-need-more-power"],
      level: 30,
      traders: DEFAULT_PROFILE.traders,
    });
    expect(window.localStorage.getItem(MODE_KEY)).toBe("progression");
  });

  it("stays locked while a connect waits for the quest list, then lands as the first import", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(PROGRESSION), { status: 200 })),
    );
    const { rerender } = render(<Harness tasks={null} />);
    await importToken("tok-123");
    expect(await screen.findByText("Importing from TarkovTracker…")).toBeInTheDocument();
    expectLocked({ panelOpen: false });
    fireEvent.click(screen.getByRole("button", { name: "Theorycraft" }));
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();

    rerender(<Harness tasks={TASKS} />);
    await screen.findByText("progression");
    expect(latestProfile()).toMatchObject({
      mode: "advanced",
      completedQuests: ["i-need-more-power"],
    });
    expect(window.localStorage.getItem(MODE_KEY)).toBe("progression");
    // Landed, the controls are live again.
    expect(screen.getByRole("button", { name: "Theorycraft" })).toBeEnabled();
  });
});

describe("the progression controls in theorycraft with a profile set", () => {
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
    expect(screen.queryByText("Set your progression.")).not.toBeInTheDocument();

    // "My progression…" switches straight back to it, without the panel.
    openPanel();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
    expect(latestProfile()).toEqual(OWN);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!)).toEqual(OWN);

    // In progression it opens the panel, which offers no one-click profile.
    openPanel();
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      expect(within(panel()).queryByRole("button", { name: ll })).not.toBeInTheDocument();
    }
  });

  it("keeps the profile set by the one-click prompt when toggled back to theorycraft", () => {
    render(<Harness />);
    openPanel();
    fireEvent.click(within(panel()).getByRole("button", { name: "LL3" }));
    fireEvent.click(screen.getByRole("button", { name: "Theorycraft" }));

    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.queryByText("Set your progression.")).not.toBeInTheDocument();
    expect(latestProfile().traders.jaeger).toBe(3);
    expect(window.localStorage.getItem(MODE_KEY)).toBe("theorycraft");
  });
});

describe("the progression controls when a re-sync fails with a profile set", () => {
  it("say so on the page once the panel is closed", async () => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(DEFAULT_PROFILE));
    window.localStorage.setItem(MODE_KEY, "progression");
    window.localStorage.setItem("tg:tarkovtracker-token", "tok-123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    render(<Harness />);

    openPanel();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Editor re-sync" }));
      fireEvent.click(within(panel()).getByRole("button", { name: "Done" }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/rate-limiting/)).toBeInTheDocument();
    // The profile and the mode stand: only the sync failed.
    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
    expect(screen.queryByText("Set your progression.")).not.toBeInTheDocument();
  });
});
