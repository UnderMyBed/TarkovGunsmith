import { z } from "zod";

/**
 * Build schema v1 — flat model, minimum viable.
 *
 * Mirrors the current in-memory state of `/builder`: a weapon id and a flat
 * list of attached mod ids. Future schema versions (v2+) add slot paths,
 * player-profile snapshot, and name/description. See
 * `docs/superpowers/specs/2026-04-19-builder-robustness-design.md` §5.
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
};

export const BuildV3 = BuildV2.extend({
  version: z.literal(3),
  profileSnapshot: PlayerProfile.optional(),
});

export type BuildV3 = z.infer<typeof BuildV3>;

/**
 * Discriminated union over all known build versions. Grows one variant per
 * Builder Robustness PR. Never mutates existing variants — old shared URLs
 * must keep parsing forever (modulo the 30-day KV TTL on builds-api).
 */
export const Build = z.discriminatedUnion("version", [BuildV1, BuildV2, BuildV3]);
export type Build = z.infer<typeof Build>;

/**
 * The version a freshly-saved build should carry. Bump each PR. `as const`
 * so callers can use this literal in `{ version: CURRENT_BUILD_VERSION }`
 * without a cast.
 */
export const CURRENT_BUILD_VERSION = 3 as const;
