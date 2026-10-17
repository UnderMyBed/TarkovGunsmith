import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchProgression,
  mapRawToProfile,
  NetworkError,
  RateLimitedError,
  ShapeMismatchError,
  TokenInvalidError,
  type PlayerProfile,
  type RawProgression,
  type TaskListItem,
} from "@tarkov/data";

const STORAGE_KEY = "tg:tarkovtracker-token";

export type SyncErrorKind =
  | "token-invalid"
  | "rate-limited"
  | "network"
  | "shape-mismatch"
  /** The progression arrived but the quest list it maps onto failed to load. */
  | "quest-list";

export type SyncState =
  | { state: "disconnected" }
  /**
   * A token is stored in this browser but nothing has been fetched yet this session —
   * what a returning user lands in. Distinct from `syncing` (no request is in flight) and
   * from `synced` (there are no counts or `lastSyncedAt` to show). It exists because
   * `disconnected` means "no token in localStorage" and claiming that for someone who has
   * already connected hides the Re-sync and Disconnect controls behind a Connect button.
   * The design doc's non-goal "Background / periodic auto-sync — only explicit
   * user-triggered re-syncs" is why mounting does not fire a fetch of its own.
   */
  | { state: "connected" }
  | { state: "syncing" }
  | {
      state: "synced";
      lastSyncedAt: number;
      /** Completed quests among the ones that gate gear. */
      questCount: number;
      /** How many quests gate gear. */
      questTotal: number;
      playerLevel: number;
    }
  | { state: "error"; kind: SyncErrorKind; message: string };

/**
 * What started a sync: the user pasting a token (`connect`), which asks for the imported
 * progression to be applied, or a re-sync of the stored token, which only refreshes it.
 */
export type SyncCause = "connect" | "resync";

export interface UseTarkovTrackerSyncArgs {
  profile: PlayerProfile;
  /** Called once a sync succeeds, with the profile it imported and what started it. */
  onChange: (next: PlayerProfile, cause: SyncCause) => void;
  tasks: readonly TaskListItem[] | undefined;
  /** The task list's load error, if it failed: a waiting progression then fails too. */
  tasksError?: Error | null;
}

export interface UseTarkovTrackerSyncResult {
  state: SyncState["state"];
  detail: SyncState;
  /** Popover calls this with a freshly-pasted token. */
  connect(token: string): Promise<void>;
  /** Re-run fetch against the already-stored token. */
  reSync(): Promise<void>;
  /** Wipe token + reset state. Profile stays untouched. */
  disconnect(): void;
}

function classifyError(err: unknown): { kind: SyncErrorKind; message: string } {
  if (err instanceof TokenInvalidError) return { kind: "token-invalid", message: err.message };
  if (err instanceof RateLimitedError) return { kind: "rate-limited", message: err.message };
  if (err instanceof ShapeMismatchError) return { kind: "shape-mismatch", message: err.message };
  if (err instanceof NetworkError) return { kind: "network", message: err.message };
  return { kind: "network", message: String(err) };
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useTarkovTrackerSync(args: UseTarkovTrackerSyncArgs): UseTarkovTrackerSyncResult {
  const [syncState, setSyncState] = useState<SyncState>(() =>
    readStoredToken() !== null ? { state: "connected" } : { state: "disconnected" },
  );

  // Keep the latest profile/onChange/tasks without invalidating connect/reSync's identity.
  // Refs aren't render output — React docs call out mutating `.current` directly in the
  // render body as unsafe under concurrent rendering (a render that gets discarded before
  // committing still performs the mutation, corrupting the ref for whichever render actually
  // lands). The effect runs after every commit, so `doSync`'s later async reads always see
  // the most recently committed args. See https://react.dev/reference/react/useRef.
  const propsRef = useRef(args);
  useEffect(() => {
    propsRef.current = args;
  });

  // A progression fetched before the task list loaded, waiting to be mapped onto it. Only the
  // latest sync's: a new sync and a disconnect both clear it.
  const pendingRaw = useRef<{ raw: RawProgression; cause: SyncCause } | null>(null);
  // Bumped by every sync and by disconnect. A fetch that resolves under an older generation
  // was superseded, and its result is dropped rather than written over newer state.
  const generation = useRef(0);

  const failQuestList = useCallback((message: string) => {
    pendingRaw.current = null;
    setSyncState({ state: "error", kind: "quest-list", message });
  }, []);

  const finish = useCallback(
    (raw: RawProgression, tasks: readonly TaskListItem[], cause: SyncCause) => {
      pendingRaw.current = null;
      const result = mapRawToProfile(raw, tasks);
      propsRef.current.onChange(
        {
          ...propsRef.current.profile,
          completedQuests: result.profile.completedQuests,
          flea: result.profile.flea,
          level: result.profile.level,
        },
        cause,
      );
      setSyncState({
        state: "synced",
        lastSyncedAt: Date.now(),
        questCount: result.meta.questCount,
        questTotal: result.meta.questTotal,
        playerLevel: result.meta.playerLevel,
      });
    },
    [],
  );

  const doSync = useCallback(
    async (token: string, cause: SyncCause) => {
      const mine = ++generation.current;
      pendingRaw.current = null;
      setSyncState({ state: "syncing" });
      try {
        const raw = await fetchProgression(token);
        if (mine !== generation.current) return;
        const { tasks, tasksError } = propsRef.current;
        if (tasks !== undefined) finish(raw, tasks, cause);
        else if (tasksError) failQuestList(tasksError.message);
        // The task list is still loading: stay `syncing` and finish when it arrives (below).
        else pendingRaw.current = { raw, cause };
      } catch (err) {
        if (mine !== generation.current) return;
        pendingRaw.current = null;
        const classified = classifyError(err);
        setSyncState({ state: "error", ...classified });
      }
    },
    [finish, failQuestList],
  );

  const { tasks, tasksError } = args;
  useEffect(() => {
    if (pendingRaw.current === null) return;
    if (tasks !== undefined) finish(pendingRaw.current.raw, tasks, pendingRaw.current.cause);
    else if (tasksError) failQuestList(tasksError.message);
  }, [tasks, tasksError, finish, failQuestList]);

  const connect = useCallback(
    async (token: string) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, token);
      } catch {
        // quota / disabled — continue; token just won't persist.
      }
      await doSync(token, "connect");
    },
    [doSync],
  );

  const reSync = useCallback(async () => {
    const token = readStoredToken();
    if (token === null) {
      setSyncState({ state: "disconnected" });
      return;
    }
    await doSync(token, "resync");
  }, [doSync]);

  const disconnect = useCallback(() => {
    generation.current++;
    pendingRaw.current = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSyncState({ state: "disconnected" });
  }, []);

  return {
    state: syncState.state,
    detail: syncState,
    connect,
    reSync,
    disconnect,
  };
}
