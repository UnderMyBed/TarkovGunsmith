import { useCallback, useRef, useState } from "react";
import {
  fetchProgression,
  mapRawToProfile,
  NetworkError,
  RateLimitedError,
  ShapeMismatchError,
  TokenInvalidError,
  type PlayerProfile,
  type TaskListItem,
} from "@tarkov/data";

const STORAGE_KEY = "tg:tarkovtracker-token";

export type SyncErrorKind = "token-invalid" | "rate-limited" | "network" | "shape-mismatch";

export type SyncState =
  | { state: "disconnected" }
  | { state: "syncing" }
  | {
      state: "synced";
      lastSyncedAt: number;
      questCount: number;
      playerLevel: number;
      unmappedCount: number;
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
    readStoredToken() !== null ? { state: "disconnected" } : { state: "disconnected" },
  );

  // Keep the latest profile/onChange/tasks without invalidating connect/reSync's identity.
  const propsRef = useRef(args);
  propsRef.current = args;

  const doSync = useCallback(async (token: string) => {
    setSyncState({ state: "syncing" });
    try {
      const raw = await fetchProgression(token);
      const tasks = propsRef.current.tasks;
      if (tasks === undefined) {
        // Tasks not loaded yet — surface as syncing. The caller re-invokes
        // once useTasks.data resolves.
        setSyncState({ state: "syncing" });
        return;
      }
      const result = mapRawToProfile(raw, tasks);
      propsRef.current.onChange({
        ...propsRef.current.profile,
        completedQuests: result.profile.completedQuests,
        flea: result.profile.flea,
      });
      setSyncState({
        state: "synced",
        lastSyncedAt: Date.now(),
        questCount: result.meta.questCount,
        playerLevel: result.meta.playerLevel,
        unmappedCount: result.meta.unmappedCount,
      });
    } catch (err) {
      const classified = classifyError(err);
      setSyncState({ state: "error", ...classified });
    }
  }, []);

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
