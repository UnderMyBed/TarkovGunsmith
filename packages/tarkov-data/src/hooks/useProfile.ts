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
    const parsed: unknown = JSON.parse(raw);
    const profile = PlayerProfile.parse(parsed);
    return seedLegacyLevel(parsed, profile);
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * Minimum PMC level that makes `flea: true` coherent.
 *
 * Mirrors the threshold `tarkovtracker/mapping.ts` uses to derive `flea` from a real level.
 * Both are unverified against the live game and should move together if either moves.
 */
const FLEA_UNLOCK_LEVEL = 20;

/**
 * Carry a pre-`level` profile's own assertion forward instead of contradicting it.
 *
 * `PlayerProfile.level` defaults to 1 so a stored profile written before the field existed
 * still parses — that default is what stops a silent wipe. But a stored `flea: true` IS the
 * user's prior assertion that they had flea access, and `{ flea: true, level: 1 }` is a state
 * the game cannot produce. Left alone it is read as a real gate: measured against the live
 * document it removes 89 of 147 reachable weapons and 682 of 1,602 mods from the pickers,
 * with no error and no explanation — `/builder` filters locked weapons out of the `<select>`
 * entirely and the optimizer drops locked mods from its search space.
 *
 * So when the stored JSON predates the field (`level` absent) and claims flea access, seed
 * the minimum level consistent with that claim. That is a translation of what the user
 * already told us, not an invention: seeding the *minimum* deliberately leaves items gated
 * above it locked, which is the gate doing its job, and the profile editor's level control
 * corrects it in one edit.
 *
 * Deliberately scoped to `parseStoredProfile`, which only ever sees the user's OWN profile.
 * A `profileSnapshot` embedded in someone else's shared build gets no such treatment — there
 * the level really is unknown, and inventing one would be asserting something about a
 * stranger's account.
 */
function seedLegacyLevel(raw: unknown, profile: PlayerProfile): PlayerProfile {
  const hasStoredLevel =
    typeof raw === "object" && raw !== null && "level" in (raw as Record<string, unknown>);
  if (hasStoredLevel || !profile.flea) return profile;
  return { ...profile, level: FLEA_UNLOCK_LEVEL };
}

/**
 * Resolve the profile `useProfile` should start with: `DEFAULT_PROFILE` when there is no
 * `window` to read from (SSR — this app doesn't ship one today, but the guard is here for
 * whichever environment runs this hook), otherwise whatever `parseStoredProfile` makes of
 * `localStorage`, with `DEFAULT_PROFILE` as the fallback if reading localStorage itself
 * throws (disabled / blocked by policy — distinct from `parseStoredProfile`'s own catch,
 * which only ever sees a string that's already been read).
 *
 * Split out of the `useState` initializer, mirroring `parseStoredProfile` above, so this
 * is directly callable without mounting a component through React — react-dom itself
 * requires `window` to render, so the `typeof window === "undefined"` branch cannot be
 * exercised through any React-based test harness (verified: `renderHook` throws
 * `ReferenceError: window is not defined` from inside react-dom before this function is
 * ever reached).
 */
export function resolveInitialProfile(): PlayerProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    return parseStoredProfile(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // localStorage itself threw (disabled / blocked by policy).
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
  const [profile, setProfileState] = useState<PlayerProfile>(resolveInitialProfile);

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
