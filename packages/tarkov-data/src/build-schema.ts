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
  modIds: z.array(z.string()).max(64),
  createdAt: z.string().datetime(),
});

export type BuildV1 = z.infer<typeof BuildV1>;

/**
 * Discriminated union over all known build versions. Grows one variant per
 * Builder Robustness PR. Never mutates existing variants — old shared URLs
 * must keep parsing forever (modulo the 30-day KV TTL on builds-api).
 */
export const Build = z.discriminatedUnion("version", [BuildV1]);
export type Build = z.infer<typeof Build>;

/**
 * The version a freshly-saved build should carry. Bump each PR. `as const`
 * so callers can use this literal in `{ version: CURRENT_BUILD_VERSION }`
 * without a cast.
 */
export const CURRENT_BUILD_VERSION = 1 as const;
