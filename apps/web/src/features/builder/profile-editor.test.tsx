// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_PROFILE, MARQUEE_QUEST_NORMALIZED_NAMES, TarkovDataProvider } from "@tarkov/data";
import type { PlayerProfile, TarkovJsonClient, TaskListItem } from "@tarkov/data";
import { ProfileEditor, useCompletedQuestSet, useTaskList } from "./profile-editor.js";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

afterEach(() => cleanup());

describe("useCompletedQuestSet", () => {
  it("returns the same Set instance across a re-render when completedQuests is unchanged", () => {
    // Regression test for a real bug: profile-editor.tsx used to build
    // `new Set(profile.completedQuests ?? [])` directly in the component body, with no
    // useMemo. Every render produced a brand new Set, so any useMemo that listed it as a
    // dependency recomputed every time — the memoisation was silently doing nothing.
    const completedQuests = ["quest-a", "quest-b"];
    const { result, rerender } = renderHook(
      ({ quests }: { quests: readonly string[] | undefined }) => useCompletedQuestSet(quests),
      { initialProps: { quests: completedQuests } },
    );
    const first = result.current;
    rerender({ quests: completedQuests }); // same array reference, nothing changed
    expect(result.current).toBe(first);
  });

  it("returns a new Set instance when completedQuests changes", () => {
    const { result, rerender } = renderHook(
      ({ quests }: { quests: readonly string[] | undefined }) => useCompletedQuestSet(quests),
      { initialProps: { quests: ["quest-a"] as readonly string[] | undefined } },
    );
    const first = result.current;
    rerender({ quests: ["quest-a", "quest-b"] });
    expect(result.current).not.toBe(first);
    expect(result.current.has("quest-b")).toBe(true);
  });

  it("treats undefined as an empty set", () => {
    const { result } = renderHook(() => useCompletedQuestSet(undefined));
    expect(result.current.size).toBe(0);
  });
});

describe("useTaskList", () => {
  const tasks: TaskListItem[] = [{ normalizedName: "task-a", name: "Task A" } as TaskListItem];

  it("returns the same array instance across a re-render when data is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: readonly TaskListItem[] | undefined }) => useTaskList(data),
      { initialProps: { data: tasks } },
    );
    const first = result.current;
    rerender({ data: tasks });
    expect(result.current).toBe(first);
  });

  it("returns a stable empty array across renders when data is undefined", () => {
    // Before the fix, `data ?? []` allocated a brand new array on every render whenever
    // `data` was undefined (e.g. while the query is still loading) — defeating any memo
    // keyed on it for the entire loading window.
    const { result, rerender } = renderHook(
      ({ data }: { data: readonly TaskListItem[] | undefined }) => useTaskList(data),
      { initialProps: { data: undefined as readonly TaskListItem[] | undefined } },
    );
    const first = result.current;
    rerender({ data: undefined });
    expect(result.current).toBe(first);
  });
});

/* ---------------------------------------------------------------------------
 * ProfileEditor — behaviour
 *
 * Driven through the component's real props (a PlayerProfile, an onChange the harness
 * actually applies, and a UseTarkovTrackerSyncResult double) over a real QueryClient and a
 * real TarkovJsonClient double, so the actual `useTasks` fetcher and its Zod schema run.
 *
 * Assertions are on labels, visible copy and the profiles the editor emits — never on
 * classes, styles or internal state — so a Builder restyle that keeps the behaviour keeps
 * these green.
 * ------------------------------------------------------------------------- */

const TRADERS_DOC: Record<string, unknown> = {
  "t-prapor": { id: "t-prapor", name: "Prapor", normalizedName: "prapor" },
  "t-mechanic": { id: "t-mechanic", name: "Mechanic", normalizedName: "mechanic" },
};

/* Two marquee quests and one ordinary one, so the Marquee / All / Incomplete filters each
 * have something to include and something to exclude. */
const TASKS_DOC = {
  tasks: {
    t1: {
      id: "t1",
      name: "Gunsmith - Master Part 1",
      normalizedName: "gunsmith-master-part-1",
      kappaRequired: true,
      trader: "t-mechanic",
    },
    t2: {
      id: "t2",
      name: "Setup",
      normalizedName: "setup",
      kappaRequired: true,
      trader: "t-prapor",
    },
    t3: {
      id: "t3",
      name: "Debut",
      normalizedName: "debut",
      kappaRequired: false,
      trader: "t-prapor",
    },
  },
};

function createTasksClient(mode?: "error" | "pending"): TarkovJsonClient {
  return {
    fetchResource<T>(resource: string): Promise<T> {
      if (resource === "traders") return Promise.resolve(structuredClone(TRADERS_DOC) as T);
      if (resource === "tasks") {
        if (mode === "error") return Promise.reject(new Error("tasks unavailable"));
        if (mode === "pending") return new Promise<T>(() => undefined);
        return Promise.resolve(structuredClone(TASKS_DOC) as T);
      }
      return Promise.reject(new Error(`no fixture for resource "${resource}"`));
    },
  };
}

function makeSync(overrides?: Partial<UseTarkovTrackerSyncResult>): UseTarkovTrackerSyncResult {
  return {
    state: "disconnected",
    detail: { state: "disconnected" },
    connect: vi.fn().mockResolvedValue(undefined),
    reSync: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function renderEditor(options?: {
  profile?: Partial<PlayerProfile>;
  sync?: UseTarkovTrackerSyncResult;
  client?: TarkovJsonClient;
}) {
  const onChange = vi.fn();
  const sync = options?.sync ?? makeSync();
  const initial: PlayerProfile = { ...DEFAULT_PROFILE, ...options?.profile };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Harness() {
    const [profile, setProfile] = useState<PlayerProfile>(initial);
    return (
      <ProfileEditor
        profile={profile}
        onChange={(next) => {
          onChange(next);
          setProfile(next);
        }}
        sync={sync}
      />
    );
  }

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={options?.client ?? createTasksClient()}>
        <Harness />
      </TarkovDataProvider>
    </QueryClientProvider>,
  );
  return { onChange, sync, ...utils };
}

/** Expand the manual-edit disclosure the way a user does — by activating its header. */
async function openManualEditor(user: ReturnType<typeof userEvent.setup>) {
  const header = screen.getByText(/^(Edit profile|Override manually)$/).closest("summary");
  if (!header) throw new Error("manual editor header not found");
  await user.click(header);
}

/** The last profile the editor emitted. */
function lastProfile(onChange: ReturnType<typeof vi.fn>): PlayerProfile {
  const call = onChange.mock.calls.at(-1);
  if (!call) throw new Error("onChange was never called");
  return call[0] as PlayerProfile;
}

describe("ProfileEditor — mode", () => {
  it("switches the profile between basic and advanced from the header", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor();

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    expect(lastProfile(onChange).mode).toBe("advanced");

    await user.click(screen.getByRole("button", { name: "Basic" }));
    expect(lastProfile(onChange).mode).toBe("basic");
  });

  it("offers TarkovTracker and the quest list only in advanced mode", async () => {
    const user = userEvent.setup();
    renderEditor();
    await openManualEditor(user);

    expect(screen.queryByRole("button", { name: /Connect TarkovTracker/ })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Filter quests…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Advanced" }));

    expect(screen.getByRole("button", { name: /Connect TarkovTracker/ })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Filter quests…")).toBeInTheDocument();
  });
});

describe("ProfileEditor — TarkovTracker", () => {
  it("hands a pasted token to the sync layer and closes the popover", async () => {
    const user = userEvent.setup();
    // Held in a local rather than read back off `sync` — reading the method off the object
    // detaches it, which `@typescript-eslint/unbound-method` correctly flags.
    const connect = vi.fn().mockResolvedValue(undefined);
    renderEditor({ profile: { mode: "advanced" }, sync: makeSync({ connect }) });

    await user.click(screen.getByRole("button", { name: /Connect TarkovTracker/ }));
    expect(screen.getByRole("heading", { name: "Connect TarkovTracker" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("TarkovTracker token"), "  tt-token  ");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(connect).toHaveBeenCalledWith("tt-token");
    expect(
      screen.queryByRole("heading", { name: "Connect TarkovTracker" }),
    ).not.toBeInTheDocument();
  });

  it("shows the sync banner instead of the connect button once a token is stored", () => {
    renderEditor({
      profile: { mode: "advanced" },
      sync: makeSync({ state: "connected", detail: { state: "connected" } }),
    });

    expect(screen.getByText(/TARKOVTRACKER · CONNECTED/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect TarkovTracker/ })).not.toBeInTheDocument();
  });

  it("reframes the manual editor as an override, and warns about it, once a sync has landed", async () => {
    const user = userEvent.setup();
    renderEditor({
      profile: { mode: "advanced" },
      sync: makeSync({
        state: "synced",
        detail: {
          state: "synced",
          lastSyncedAt: Date.now(),
          questCount: 12,
          playerLevel: 30,
          unmappedCount: 0,
        },
      }),
    });

    expect(screen.getByText("Override manually")).toBeInTheDocument();
    expect(screen.queryByText("Edit profile")).not.toBeInTheDocument();

    await openManualEditor(user);
    expect(
      await screen.findByText(
        "Manual toggles override the TarkovTracker snapshot until the next Re-sync.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ProfileEditor — traders, flea and level", () => {
  it("records a trader loyalty change without disturbing the other traders", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor();
    await openManualEditor(user);

    await user.selectOptions(screen.getByLabelText("Mechanic"), "3");

    const next = lastProfile(onChange);
    expect(next.traders.mechanic).toBe(3);
    expect(next.traders.prapor).toBe(1);
    expect(next.traders.jaeger).toBe(1);
  });

  it("records flea access and explains the level gate it introduces", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ profile: { level: 12 } });
    await openManualEditor(user);

    expect(screen.queryByText(/stay locked/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Flea market access"));

    expect(lastProfile(onChange).flea).toBe(true);
    expect(
      screen.getByText("Flea offers with a level requirement above 12 stay locked."),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Flea market access"));
    expect(lastProfile(onChange).flea).toBe(false);
    expect(screen.queryByText(/stay locked/)).not.toBeInTheDocument();
  });

  it("records a typed PMC level", async () => {
    const user = userEvent.setup();
    // Starts at 4; typing a digit at the caret takes it to 42, the way a real edit does.
    const { onChange } = renderEditor({ profile: { level: 4 } });
    await openManualEditor(user);

    const level = screen.getByLabelText("PMC level");
    await user.type(level, "2");

    expect(lastProfile(onChange).level).toBe(42);
    expect(level).toHaveValue(42);
  });

  it("clamps a level entered outside the allowed range instead of storing it", async () => {
    // jsdom's <input type="number"> exposes no text-selection API, so userEvent's
    // `{selectall}` cannot replace the field contents and every keystroke appends. A raw
    // change event is the only way to put an out-of-range value in the box here. The
    // assertion is unchanged in kind: it is on the profile the editor emits.
    const user = userEvent.setup();
    const { onChange } = renderEditor();
    await openManualEditor(user);

    const level = screen.getByLabelText("PMC level");

    fireEvent.change(level, { target: { value: "500" } });
    expect(lastProfile(onChange).level).toBe(99);

    fireEvent.change(level, { target: { value: "0" } });
    expect(lastProfile(onChange).level).toBe(1);
  });

  it("commits nothing while the level field is emptied, and comes to rest on the stored level", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ profile: { level: 27 } });
    await openManualEditor(user);

    const level = screen.getByLabelText("PMC level");
    const before = onChange.mock.calls.length;

    await user.clear(level);
    // A blank box is mid-edit, not "level 0" and not "level NaN" — nothing is committed.
    expect(onChange.mock.calls.length).toBe(before);

    // The contract from the source comment: the field can never come to rest showing a level
    // the profile does not hold. Deliberately silent about WHICH mechanism restores it —
    // React's own controlled-input repair and the component's onBlur snap-back both land here,
    // and pinning the test to one of them would make it a test of the implementation.
    await user.tab();
    expect(level).toHaveValue(27);
  });
});

describe("ProfileEditor — quests", () => {
  async function renderQuests(options?: Parameters<typeof renderEditor>[0]) {
    const user = userEvent.setup();
    const rendered = renderEditor({
      ...options,
      profile: { mode: "advanced", ...options?.profile },
    });
    await openManualEditor(user);
    return { user, ...rendered };
  }

  it("shows marquee quests by default and the rest only under All", async () => {
    const { user } = await renderQuests();

    expect(await screen.findByLabelText("Gunsmith - Master Part 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Setup")).toBeInTheDocument();
    expect(screen.queryByLabelText("Debut")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByLabelText("Debut")).toBeInTheDocument();
  });

  it("drops already-completed quests under Incomplete", async () => {
    const { user } = await renderQuests({ profile: { completedQuests: ["setup"] } });

    expect(await screen.findByLabelText("Setup")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Incomplete" }));

    expect(screen.queryByLabelText("Setup")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Gunsmith - Master Part 1")).toBeInTheDocument();
  });

  it("filters the list by name, ignoring case", async () => {
    const { user } = await renderQuests();
    await screen.findByLabelText("Setup");

    await user.type(screen.getByPlaceholderText("Filter quests…"), "GUNSMITH");

    expect(screen.getByLabelText("Gunsmith - Master Part 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Setup")).not.toBeInTheDocument();
  });

  it("toggles a quest on and back off", async () => {
    const { user, onChange } = await renderQuests();
    const setup = await screen.findByLabelText("Setup");

    await user.click(setup);
    expect(lastProfile(onChange).completedQuests).toContain("setup");
    expect(setup).toBeChecked();

    await user.click(setup);
    expect(lastProfile(onChange).completedQuests).not.toContain("setup");
    expect(setup).not.toBeChecked();
  });

  it("counts completed quests overall and against the marquee list", async () => {
    await renderQuests({ profile: { completedQuests: ["setup", "debut"] } });

    expect(await screen.findByText(/2 complete/)).toBeInTheDocument();
    // "debut" is not a marquee quest, so only one of the two counts toward the marquee tally.
    expect(
      screen.getByRole("button", {
        name: `Marquee (1/${String(MARQUEE_QUEST_NORMALIZED_NAMES.length)})`,
      }),
    ).toBeInTheDocument();
  });

  it("says the quest list is still loading while it is in flight", async () => {
    await renderQuests({ client: createTasksClient("pending") });
    expect(await screen.findByText("Loading quest list…")).toBeInTheDocument();
  });

  it("keeps the filters usable and says so when the quest list fails to load", async () => {
    await renderQuests({ client: createTasksClient("error") });

    expect(
      await screen.findByText(
        "Couldn't load quest list — toggles still work against cached slugs.",
      ),
    ).toBeInTheDocument();
    // The controls stay — a failed list must not take the section down with it.
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter quests…")).toBeInTheDocument();
  });
});
