import { describe, expect, it } from "vitest";
import { parseStoredProfile } from "./useProfile.js";
import { DEFAULT_PROFILE } from "../build-schema.js";

/**
 * Rehydration guard for `localStorage["tg:player-profile"]`.
 *
 * `useProfile` falls back to `DEFAULT_PROFILE` on any parse failure and reports nothing,
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
