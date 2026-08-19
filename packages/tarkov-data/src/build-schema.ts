import { z } from "zod";

/**
 * Build schema v1 — flat model, minimum viable.
 *
 * Mirrors the current in-memory state of `/builder`: a weapon id and a flat
 * list of attached mod ids. Later schema versions (v2+) add slot paths, a
 * player-profile snapshot, and name/description; see `build-migrations.ts`
 * for how each version upgrades to the next.
 */
export const BuildV1 = z.object({
  version: z.literal(1),
  weaponId: z.string().min(1),
  modIds: z.array(z.string().min(1)).max(64),
  // UTC-only: Zod rejects timezone offsets by default; Date.toISOString() always produces a Z-suffix.
  createdAt: z.string().datetime(),
});

export type BuildV1 = z.infer<typeof BuildV1>;

/**
 * Build schema v2 — slot-aware.
 *
 * Replaces the flat `modIds` array with a `Record<SlotPath, ItemId>` map
 * keyed by `/`-joined slot `nameId` paths (e.g. `"mod_scope/mod_mount_000"`).
 * `orphaned` captures item ids the v1→v2 migration couldn't place in the
 * current weapon tree — rendered as a dismissable banner so the user can
 * manually re-home them.
 */
export const BuildV2 = z.object({
  version: z.literal(2),
  weaponId: z.string().min(1),
  attachments: z.record(z.string().min(1), z.string().min(1)),
  orphaned: z.array(z.string().min(1)).max(64),
  // UTC-only: Zod rejects timezone offsets by default; Date.toISOString() always produces a Z-suffix.
  createdAt: z.string().datetime(),
});

export type BuildV2 = z.infer<typeof BuildV2>;

export const PlayerProfile = z.object({
  mode: z.enum(["basic", "advanced"]),
  traders: z.object({
    prapor: z.number().int().min(1).max(4),
    therapist: z.number().int().min(1).max(4),
    skier: z.number().int().min(1).max(4),
    peacekeeper: z.number().int().min(1).max(4),
    mechanic: z.number().int().min(1).max(4),
    ragman: z.number().int().min(1).max(4),
    jaeger: z.number().int().min(1).max(4),
  }),
  flea: z.boolean(),
  /**
   * PMC level. Gates flea-market offers that carry a `minLevelForFlea` requirement —
   * 778 of the 1,638 weapon mods in the live document have one (615 at 20, 163 at 25).
   * Only bites when `flea` is true; a player without flea access is blocked earlier.
   *
   * `.default(1)` is load-bearing, not a convenience. `hooks/useProfile.ts` rehydrates
   * from localStorage through `PlayerProfile.parse` inside a try/catch that falls back to
   * `DEFAULT_PROFILE`. A required-without-default field would make every profile stored
   * before this change fail to parse and silently reset — wiping the user's trader LLs
   * and their entire completed-quest list, with no error anywhere. Wire-optional is
   * mandatory here, and must stay that way for any future field on this object.
   *
   * The 99 ceiling is deliberately looser than the in-game cap (~79, and BSG moves it
   * between patches). The asymmetry is the whole reason: a ceiling set too low turns a
   * legitimate stored profile into a parse failure, i.e. a silent wipe; a ceiling set too
   * high just lets someone type a silly number that only affects their own gating. 99 is
   * not a claim about the game cap.
   */
  level: z.number().int().min(1).max(99).default(1),
  completedQuests: z.array(z.string().min(1)).max(256).optional(),
});

export type PlayerProfile = z.infer<typeof PlayerProfile>;

export const DEFAULT_PROFILE: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 1,
    therapist: 1,
    skier: 1,
    peacekeeper: 1,
    mechanic: 1,
    ragman: 1,
    jaeger: 1,
  },
  flea: false,
  level: 1,
};

export const BuildV3 = BuildV2.extend({
  version: z.literal(3),
  profileSnapshot: PlayerProfile.optional(),
});

export type BuildV3 = z.infer<typeof BuildV3>;

export const BuildV4 = BuildV3.extend({
  version: z.literal(4),
  name: z.string().max(60).optional(),
  description: z.string().max(280).optional(),
});

export type BuildV4 = z.infer<typeof BuildV4>;

/**
 * v5 is structurally identical to v4. The version exists to mark that
 * `profileSnapshot.completedQuests` has been remapped onto upstream's restructured Gunsmith
 * quest names — see `migrateV4ToV5`.
 */
export const BuildV5 = BuildV4.extend({
  version: z.literal(5),
});

export type BuildV5 = z.infer<typeof BuildV5>;

/**
 * v6 is structurally identical to v5. The version exists to mark that the build's
 * `profileSnapshot.level` is an author assertion rather than a parser-supplied default —
 * see `migrateV5ToV6`.
 */
export const BuildV6 = BuildV5.extend({
  version: z.literal(6),
});

export type BuildV6 = z.infer<typeof BuildV6>;

/**
 * Discriminated union over all known build versions. Grows one variant per
 * Builder Robustness PR. Never mutates existing variants — old shared URLs
 * must keep parsing forever (modulo the 30-day KV TTL on builds-api).
 */
export const Build = z.discriminatedUnion("version", [
  BuildV1,
  BuildV2,
  BuildV3,
  BuildV4,
  BuildV5,
  BuildV6,
]);
export type Build = z.infer<typeof Build>;

/**
 * The version a freshly-saved build should carry. Bump each PR. `as const`
 * so callers can use this literal in `{ version: CURRENT_BUILD_VERSION }`
 * without a cast.
 */
export const CURRENT_BUILD_VERSION = 6 as const;
