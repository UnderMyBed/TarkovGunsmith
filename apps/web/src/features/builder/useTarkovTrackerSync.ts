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

export type SyncErrorKind = "token-invalid" | "rate-limited" | "network" | "shape-mismatch";

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

export interface UseTarkovTrackerSyncArgs {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  tasks: readonly TaskListItem[] | undefined;
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

  // A progression fetched before the task list loaded, waiting to be mapped onto it.
  const pendingRaw = useRef<RawProgression | null>(null);

  const finish = useCallback((raw: RawProgression, tasks: readonly TaskListItem[]) => {
    pendingRaw.current = null;
    const result = mapRawToProfile(raw, tasks);
    propsRef.current.onChange({
      ...propsRef.current.profile,
      completedQuests: result.profile.completedQuests,
      flea: result.profile.flea,
      level: result.profile.level,
    });
    setSyncState({
      state: "synced",
      lastSyncedAt: Date.now(),
      questCount: result.meta.questCount,
      questTotal: result.meta.questTotal,
      playerLevel: result.meta.playerLevel,
    });
  }, []);

  const doSync = useCallback(
    async (token: string) => {
      setSyncState({ state: "syncing" });
      try {
        const raw = await fetchProgression(token);
        const tasks = propsRef.current.tasks;
        // The task list is still loading: stay `syncing` and finish when it arrives (below).
        if (tasks === undefined) pendingRaw.current = raw;
        else finish(raw, tasks);
      } catch (err) {
        const classified = classifyError(err);
        setSyncState({ state: "error", ...classified });
      }
    },
    [finish],
  );

  const { tasks } = args;
  useEffect(() => {
    if (tasks !== undefined && pendingRaw.current !== null) finish(pendingRaw.current, tasks);
  }, [tasks, finish]);

  const connect = useCallback(
    async (token: string) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, token);
      } catch {
        // quota / disabled — continue; token just won't persist.
      }
      await doSync(token);
    },
    [doSync],
  );

  const reSync = useCallback(async () => {
    const token = readStoredToken();
    if (token === null) {
      setSyncState({ state: "disconnected" });
      return;
    }
    await doSync(token);
  }, [doSync]);

  const disconnect = useCallback(() => {
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
