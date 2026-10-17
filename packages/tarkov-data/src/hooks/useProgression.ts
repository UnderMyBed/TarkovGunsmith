import { useCallback, useEffect, useState } from "react";
import { PlayerProfile, DEFAULT_PROFILE } from "../build-schema.js";
import type { BuilderMode } from "../preset-seed.js";

const STORAGE_KEY = "tg:player-profile";
/** Where the Builder's mode is kept, beside the profile it decides whether to apply. */
const MODE_STORAGE_KEY = "tg:builder-mode";

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
export const FLEA_UNLOCK_LEVEL = 20;

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
 * Resolve the profile {@link useProgression} should start with: `DEFAULT_PROFILE` when there
 * is no `window` to read from (SSR — this app doesn't ship one today, but the guard is here for
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
 * The Builder's mode from what is stored: the stored mode when there is one; otherwise
 * `progression` when a profile is stored that parses, since only the user setting a profile
 * ever writes one; otherwise `theorycraft`, the first visit.
 *
 * A profile stored before the mode existed therefore lands in progression with nothing
 * written, and one that does not parse (which `parseStoredProfile` resets to the default)
 * counts as no profile.
 */
export function resolveMode(rawMode: string | null, rawProfile: string | null): BuilderMode {
  if (rawMode === "theorycraft" || rawMode === "progression") return rawMode;
  return isStoredProfile(rawProfile) ? "progression" : "theorycraft";
}

/** Whether `raw` is a profile the user set: present, and one that parses. */
export function isStoredProfile(raw: string | null): boolean {
  if (raw === null || raw === "") return false;
  try {
    return PlayerProfile.safeParse(JSON.parse(raw)).success;
  } catch {
    return false;
  }
}

/** {@link resolveMode} over `localStorage`; `theorycraft` when it cannot be read. */
export function resolveInitialMode(): BuilderMode {
  if (typeof window === "undefined") return "theorycraft";
  try {
    return resolveMode(
      window.localStorage.getItem(MODE_STORAGE_KEY),
      window.localStorage.getItem(STORAGE_KEY),
    );
  } catch {
    return "theorycraft";
  }
}

/** {@link isStoredProfile} over `localStorage`; `false` when it cannot be read. */
export function resolveHasProfile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isStoredProfile(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/** A trader loyalty level the one-click profiles set. */
export type LoyaltyLevel = 1 | 2 | 3 | 4;

/** PMC level and flea access for each one-click loyalty profile. */
const LOYALTY_PROFILE: Record<LoyaltyLevel, { level: number; flea: boolean }> = {
  1: { level: 1, flea: false },
  2: { level: FLEA_UNLOCK_LEVEL, flea: true },
  3: { level: 30, flea: true },
  4: { level: 40, flea: true },
};

/**
 * `base` with every trader at `ll`, and the PMC level and flea access that go with it. The
 * profile's mode (basic or advanced) and its completed quests are kept.
 */
export function loyaltyProfile(ll: LoyaltyLevel, base: PlayerProfile): PlayerProfile {
  return {
    ...base,
    traders: {
      prapor: ll,
      therapist: ll,
      skier: ll,
      peacekeeper: ll,
      mechanic: ll,
      ragman: ll,
      jaeger: ll,
    },
    ...LOYALTY_PROFILE[ll],
  };
}

export interface Progression {
  readonly profile: PlayerProfile;
  /**
   * Whether the user has set a profile, now or on an earlier visit. Until they have,
   * {@link profile} is `DEFAULT_PROFILE` and nothing of theirs is at stake.
   */
  readonly hasProfile: boolean;
  /**
   * Sets the profile, and with it progression mode: what the user does to choose a profile,
   * a profile set is a profile applied.
   */
  readonly setProfile: (next: PlayerProfile) => void;
  /**
   * Writes the profile and leaves the mode as it is: for a refresh the user did not just ask
   * to apply, such as a TarkovTracker re-sync finishing after a switch to theorycraft.
   */
  readonly updateProfile: (next: PlayerProfile) => void;
  readonly mode: BuilderMode;
  readonly setMode: (next: BuilderMode) => void;
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage quota or disabled — the value persists only for the session.
  }
}

/**
 * The player's profile, backed by `localStorage["tg:player-profile"]`, and the Builder's mode,
 * backed by `localStorage["tg:builder-mode"]`.
 *
 * The first visit is theorycraft; setting a profile switches to progression; the mode is a
 * toggle either way after that. See {@link resolveMode} for a returning visitor. Writes are
 * synchronous to state and best-effort to localStorage.
 *
 * On mount, rehydrates the profile through `PlayerProfile.parse`, so a corrupted or
 * version-mismatched stored value falls back to DEFAULT_PROFILE rather than throwing.
 */
export function useProgression(): Progression {
  const [profile, setProfileState] = useState<PlayerProfile>(resolveInitialProfile);
  const [mode, setModeState] = useState<BuilderMode>(resolveInitialMode);
  const [hasProfile, setHasProfile] = useState<boolean>(resolveHasProfile);

  const setMode = useCallback((next: BuilderMode) => {
    setModeState(next);
    store(MODE_STORAGE_KEY, next);
  }, []);

  // Another tab setting the profile or the mode writes the same keys; follow it, so a prompt
  // this tab still shows cannot overwrite the profile the other tab just set. The event fires
  // only in the tabs that did not write.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== MODE_STORAGE_KEY) {
        return;
      }
      setProfileState(resolveInitialProfile());
      setHasProfile(resolveHasProfile());
      setModeState(resolveInitialMode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateProfile = useCallback((next: PlayerProfile) => {
    setProfileState(next);
    setHasProfile(true);
    store(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setProfile = useCallback(
    (next: PlayerProfile) => {
      updateProfile(next);
      setMode("progression");
    },
    [updateProfile, setMode],
  );

  return { profile, hasProfile, setProfile, updateProfile, mode, setMode };
}
