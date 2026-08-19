import { useState, useCallback } from "react";
import { PlayerProfile, DEFAULT_PROFILE } from "../build-schema.js";

const STORAGE_KEY = "tg:player-profile";

/**
 * Parse one raw localStorage string into a profile, falling back to `DEFAULT_PROFILE`
 * on anything unreadable.
 *
 * Split out of the hook so the fallback is directly testable in a node environment.
 * That fallback is the project's sharpest silent-data-loss edge: it swallows the parse
 * error and returns defaults, so any newly-required field on `PlayerProfile` would wipe
 * every stored profile — trader LLs and the whole completed-quest list — with no error
 * surfaced anywhere. New fields must carry a `.default()`; see `PlayerProfile.level`.
 */
export function parseStoredProfile(raw: string | null): PlayerProfile {
  if (raw === null || raw === "") return DEFAULT_PROFILE;
  try {
    return PlayerProfile.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * Reactive player profile backed by `localStorage["tg:player-profile"]`.
 *
 * Returns a `[profile, setProfile]` tuple. Writes are synchronous to state
 * and best-effort to localStorage (a quota-exceeded or storage-disabled error
 * is swallowed so the app still works; the profile just won't persist across
 * reloads in that browser).
 *
 * On mount, rehydrates from localStorage through `PlayerProfile.parse` so a
 * corrupted or version-mismatched stored value falls back to DEFAULT_PROFILE
 * rather than throwing.
 */
export function useProfile(): [PlayerProfile, (next: PlayerProfile) => void] {
  const [profile, setProfileState] = useState<PlayerProfile>(() => {
    if (typeof window === "undefined") return DEFAULT_PROFILE;
    try {
      return parseStoredProfile(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // localStorage itself threw (disabled / blocked by policy).
      return DEFAULT_PROFILE;
    }
  });

  const setProfile = useCallback((next: PlayerProfile) => {
    setProfileState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage quota or disabled — profile persists only for the session.
    }
  }, []);

  return [profile, setProfile];
}
