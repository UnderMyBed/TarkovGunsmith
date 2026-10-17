// @vitest-environment jsdom
//
// The whole file runs under jsdom now, not just the `useProgression` hook tests below —
// `parseStoredProfile` doesn't care about the environment, and splitting it into a second
// file just to get jsdom for the hook would separate two things that are about the same
// piece of behaviour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  FLEA_UNLOCK_LEVEL,
  loyaltyProfile,
  parseStoredProfile,
  resolveHasProfile,
  resolveInitialMode,
  resolveInitialProfile,
  resolveMode,
  useProgression,
} from "./useProgression.js";
import { DEFAULT_PROFILE } from "../build-schema.js";

/**
 * Rehydration guard for `localStorage["tg:player-profile"]`.
 *
 * `useProgression` falls back to `DEFAULT_PROFILE` on any parse failure and reports nothing,
 * so a schema change that makes an existing stored profile unparseable doesn't error —
 * it silently deletes the user's trader LLs and their whole completed-quest list. These
 * tests exist to make that failure mode loud at build time instead.
 */

/** Exactly what a profile written before the `level` field looked like on disk. */
const STORED_BEFORE_LEVEL = JSON.stringify({
  mode: "advanced",
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
  completedQuests: ["gunsmith-master-part-1", "gunsmith-master-part-2", "setup"],
});

describe("parseStoredProfile", () => {
  it("rehydrates a profile stored before `level` existed without losing anything", () => {
    const profile = parseStoredProfile(STORED_BEFORE_LEVEL);

    // Seeded from the stored `flea: true`, NOT the schema default of 1. That stored flag is
    // the user's own prior assertion that they had flea access, and `{ flea: true, level: 1 }`
    // is a state the game cannot produce — read as a real gate it removes 89 of 147 reachable
    // weapons and 682 of 1,602 mods from the pickers with no explanation. See `seedLegacyLevel`.
    expect(profile.level).toBe(20);
    expect(profile.mode).toBe("advanced");
    expect(profile.flea).toBe(true);
    expect(profile.traders).toEqual({
      prapor: 4,
      therapist: 3,
      skier: 2,
      peacekeeper: 4,
      mechanic: 3,
      ragman: 2,
      jaeger: 1,
    });
    expect(profile.completedQuests).toEqual([
      "gunsmith-master-part-1",
      "gunsmith-master-part-2",
      "setup",
    ]);
  });

  it("does not silently reset to DEFAULT_PROFILE on a level-less stored value", () => {
    // The precise failure this file exists to catch: falling back here means the user's
    // LL4 Prapor and 3 completed quests are gone, with nothing shown to them.
    expect(parseStoredProfile(STORED_BEFORE_LEVEL)).not.toEqual(DEFAULT_PROFILE);
  });

  it("does not seed a level for a stored profile without flea access", () => {
    // The seed exists to preserve a `flea: true` assertion. Without one there is nothing to
    // preserve, so the schema default stands and the profile stays maximally restrictive.
    const stored = JSON.stringify({ ...DEFAULT_PROFILE, flea: false });
    expect(parseStoredProfile(stored).level).toBe(1);
  });

  it("never overrides a level the user actually stored", () => {
    // Seeding is strictly for profiles predating the field. An explicit level wins even when
    // it contradicts `flea` — the user's own edit is not ours to second-guess.
    const stored = JSON.stringify({ ...DEFAULT_PROFILE, flea: true, level: 3 });
    expect(parseStoredProfile(stored).level).toBe(3);
  });

  it("round-trips a profile that already carries a level", () => {
    const stored = JSON.stringify({ ...DEFAULT_PROFILE, level: 42, flea: true });
    expect(parseStoredProfile(stored).level).toBe(42);
  });

  it("keeps a stored profile with 300 completed quests, as a TarkovTracker sync once wrote", () => {
    const completedQuests = Array.from({ length: 300 }, (_, i) => `quest-${String(i)}`);
    const stored = JSON.stringify({
      ...DEFAULT_PROFILE,
      mode: "advanced",
      traders: { ...DEFAULT_PROFILE.traders, mechanic: 4 },
      level: 40,
      completedQuests,
    });
    const profile = parseStoredProfile(stored);
    expect(profile.completedQuests).toEqual(completedQuests);
    expect(profile.traders.mechanic).toBe(4);
    expect(profile.level).toBe(40);
  });

  it("falls back to DEFAULT_PROFILE when nothing is stored", () => {
    expect(parseStoredProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(parseStoredProfile("")).toEqual(DEFAULT_PROFILE);
  });

  it("falls back to DEFAULT_PROFILE on malformed JSON", () => {
    expect(parseStoredProfile("{not json")).toEqual(DEFAULT_PROFILE);
  });

  it("falls back to DEFAULT_PROFILE on a structurally invalid profile", () => {
    expect(parseStoredProfile(JSON.stringify({ mode: "basic" }))).toEqual(DEFAULT_PROFILE);
  });

  it("falls back to DEFAULT_PROFILE on an out-of-range level", () => {
    const stored = JSON.stringify({ ...DEFAULT_PROFILE, level: 500 });
    expect(parseStoredProfile(stored)).toEqual(DEFAULT_PROFILE);
  });
});

const STORAGE_KEY = "tg:player-profile";

describe("resolveInitialProfile", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("returns DEFAULT_PROFILE when window is undefined", () => {
    // Called directly (not through renderHook) specifically so this doesn't need a mounted
    // component — see the comment on resolveInitialProfile for why react-dom rules that out.
    const realWindow = globalThis.window;
    // @ts-expect-error -- simulating an environment with no `window`, e.g. SSR.
    delete globalThis.window;
    try {
      expect(resolveInitialProfile()).toEqual(DEFAULT_PROFILE);
    } finally {
      globalThis.window = realWindow;
    }
  });

  it("reads through parseStoredProfile when window exists", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_PROFILE, level: 33 }));
    expect(resolveInitialProfile()).toEqual({ ...DEFAULT_PROFILE, level: 33 });
  });

  it("falls back to DEFAULT_PROFILE when localStorage.getItem itself throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(resolveInitialProfile()).toEqual(DEFAULT_PROFILE);
  });
});

describe("useProgression: the profile", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("initializes to DEFAULT_PROFILE when nothing is stored", () => {
    const { result } = renderHook(() => useProgression());
    expect(result.current.profile).toEqual(DEFAULT_PROFILE);
  });

  it("rehydrates from an existing localStorage value on mount", () => {
    const stored = { ...DEFAULT_PROFILE, level: 42, flea: true };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useProgression());
    expect(result.current.profile).toEqual(stored);
  });

  it("setProfile updates the returned state and persists to localStorage", () => {
    const { result } = renderHook(() => useProgression());
    const next = { ...DEFAULT_PROFILE, level: 10, flea: true };

    act(() => result.current.setProfile(next));

    expect(result.current.profile).toEqual(next);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(next);
  });

  it("still updates state when localStorage.setItem throws (quota exceeded / disabled)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() => useProgression());
    const next = { ...DEFAULT_PROFILE, level: 7 };

    // Must not throw out of the state update despite the write failing underneath.
    expect(() => act(() => result.current.setProfile(next))).not.toThrow();
    expect(result.current.profile).toEqual(next);
  });

  it("falls back to DEFAULT_PROFILE when localStorage.getItem itself throws on mount", () => {
    // Distinct from parseStoredProfile's own internal catch (malformed JSON, schema
    // mismatch): this is `window.localStorage.getItem` throwing synchronously, e.g. a
    // browser that blocks storage access entirely. useProgression wraps that call in its own
    // try/catch specifically because parseStoredProfile can't see it — it never runs.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const { result } = renderHook(() => useProgression());
    expect(result.current.profile).toEqual(DEFAULT_PROFILE);
  });
});

const MODE_KEY = "tg:builder-mode";
const STORED_PROFILE = JSON.stringify({ ...DEFAULT_PROFILE, level: 12 });

describe("resolveMode", () => {
  it("is theorycraft on a first visit: nothing stored", () => {
    expect(resolveMode(null, null)).toBe("theorycraft");
    expect(resolveMode(null, "")).toBe("theorycraft");
  });

  it("is progression for a profile stored before the mode existed", () => {
    expect(resolveMode(null, STORED_PROFILE)).toBe("progression");
  });

  it("treats a stored profile that does not parse as no profile", () => {
    expect(resolveMode(null, "{not json")).toBe("theorycraft");
    expect(resolveMode(null, JSON.stringify({ mode: "basic" }))).toBe("theorycraft");
  });

  it("lets a stored mode win either way", () => {
    expect(resolveMode("theorycraft", STORED_PROFILE)).toBe("theorycraft");
    expect(resolveMode("progression", null)).toBe("progression");
  });

  it("ignores a stored mode it does not know", () => {
    expect(resolveMode("show-all", STORED_PROFILE)).toBe("progression");
    expect(resolveMode("show-all", null)).toBe("theorycraft");
  });
});

describe("resolveInitialMode", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("reads both keys", () => {
    expect(resolveInitialMode()).toBe("theorycraft");
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    expect(resolveInitialMode()).toBe("progression");
    window.localStorage.setItem(MODE_KEY, "theorycraft");
    expect(resolveInitialMode()).toBe("theorycraft");
  });

  it("is theorycraft when localStorage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(resolveInitialMode()).toBe("theorycraft");
  });

  it("is theorycraft when window is undefined", () => {
    const realWindow = globalThis.window;
    // @ts-expect-error -- simulating an environment with no `window`, e.g. SSR.
    delete globalThis.window;
    try {
      expect(resolveInitialMode()).toBe("theorycraft");
    } finally {
      globalThis.window = realWindow;
    }
  });
});

describe("useProgression: the mode", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("starts in theorycraft on a first visit and writes nothing", () => {
    const { result } = renderHook(() => useProgression());
    expect(result.current.mode).toBe("theorycraft");
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("starts in progression for a returning visitor with a stored profile", () => {
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    const { result } = renderHook(() => useProgression());
    expect(result.current.mode).toBe("progression");
  });

  it("switches to progression when a profile is set, and keeps it", () => {
    const { result } = renderHook(() => useProgression());
    act(() => result.current.setProfile(loyaltyProfile(2, DEFAULT_PROFILE)));
    expect(result.current.mode).toBe("progression");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("progression");

    const reloaded = renderHook(() => useProgression());
    expect(reloaded.result.current.mode).toBe("progression");
    expect(reloaded.result.current.profile.traders.peacekeeper).toBe(2);
  });

  it("persists a switch back to theorycraft over a stored profile", () => {
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    const { result } = renderHook(() => useProgression());
    act(() => result.current.setMode("theorycraft"));
    expect(result.current.mode).toBe("theorycraft");

    const reloaded = renderHook(() => useProgression());
    expect(reloaded.result.current.mode).toBe("theorycraft");
    expect(reloaded.result.current.profile.level).toBe(12);
  });

  it("still switches when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() => useProgression());
    expect(() => act(() => result.current.setMode("progression"))).not.toThrow();
    expect(result.current.mode).toBe("progression");
  });
});

describe("useProgression: whether a profile is set", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("is false on a first visit and for a stored profile that does not parse", () => {
    expect(renderHook(() => useProgression()).result.current.hasProfile).toBe(false);
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(renderHook(() => useProgression()).result.current.hasProfile).toBe(false);
  });

  it("is true for a stored profile, and once one is set or updated", () => {
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    expect(renderHook(() => useProgression()).result.current.hasProfile).toBe(true);

    window.localStorage.clear();
    const { result } = renderHook(() => useProgression());
    act(() => result.current.updateProfile({ ...DEFAULT_PROFILE, level: 3 }));
    expect(result.current.hasProfile).toBe(true);
  });

  it("is false when localStorage cannot be read, or there is no window", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(resolveHasProfile()).toBe(false);
    vi.restoreAllMocks();

    const realWindow = globalThis.window;
    // @ts-expect-error -- simulating an environment with no `window`, e.g. SSR.
    delete globalThis.window;
    try {
      expect(resolveHasProfile()).toBe(false);
    } finally {
      globalThis.window = realWindow;
    }
  });
});

describe("useProgression: updateProfile", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("writes the profile and leaves theorycraft alone", () => {
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    window.localStorage.setItem(MODE_KEY, "theorycraft");
    const { result } = renderHook(() => useProgression());
    act(() => result.current.updateProfile({ ...DEFAULT_PROFILE, level: 30 }));

    expect(result.current.mode).toBe("theorycraft");
    expect(result.current.profile.level).toBe(30);
    expect(window.localStorage.getItem(MODE_KEY)).toBe("theorycraft");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ level: 30 });
  });
});

describe("useProgression across tabs", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  /** What another tab's write looks like here: the value stored, then a `storage` event. */
  function writeFromAnotherTab(key: string, value: string | null) {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  }

  it("follows a profile another tab sets: the profile, that one is set, and progression", () => {
    const { result } = renderHook(() => useProgression());
    expect(result.current).toMatchObject({ hasProfile: false, mode: "theorycraft" });

    const ll4 = loyaltyProfile(4, DEFAULT_PROFILE);
    act(() => {
      writeFromAnotherTab(STORAGE_KEY, JSON.stringify(ll4));
      writeFromAnotherTab(MODE_KEY, "progression");
    });
    expect(result.current.profile).toEqual(ll4);
    expect(result.current.hasProfile).toBe(true);
    expect(result.current.mode).toBe("progression");
  });

  it("follows a mode switch another tab makes, and a storage clear", () => {
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    const { result } = renderHook(() => useProgression());
    act(() => writeFromAnotherTab(MODE_KEY, "theorycraft"));
    expect(result.current.mode).toBe("theorycraft");

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current).toMatchObject({
      profile: DEFAULT_PROFILE,
      hasProfile: false,
      mode: "theorycraft",
    });
  });

  it("stops listening once unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useProgression());
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
    remove.mockRestore();
  });

  it("ignores another key", () => {
    window.localStorage.setItem(STORAGE_KEY, STORED_PROFILE);
    const { result } = renderHook(() => useProgression());
    const before = result.current.profile;
    act(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROFILE));
      window.dispatchEvent(new StorageEvent("storage", { key: "tg:builder-draft" }));
    });
    expect(result.current.profile).toBe(before);
  });
});

describe("loyaltyProfile", () => {
  const ADVANCED = {
    ...DEFAULT_PROFILE,
    mode: "advanced" as const,
    completedQuests: ["setup"],
  };

  it("sets every trader to the level, with the PMC level and flea that go with it", () => {
    expect(loyaltyProfile(1, DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE);
    const ll2 = loyaltyProfile(2, DEFAULT_PROFILE);
    expect(new Set(Object.values(ll2.traders))).toEqual(new Set([2]));
    expect(ll2).toMatchObject({ level: FLEA_UNLOCK_LEVEL, flea: true });
    expect(loyaltyProfile(3, DEFAULT_PROFILE)).toMatchObject({ level: 30, flea: true });
    expect(loyaltyProfile(4, DEFAULT_PROFILE)).toMatchObject({ level: 40, flea: true });
  });

  it("keeps the profile's mode and completed quests", () => {
    const ll4 = loyaltyProfile(4, ADVANCED);
    expect(ll4.mode).toBe("advanced");
    expect(ll4.completedQuests).toEqual(["setup"]);
  });
});
