import { z } from "zod";
import { Build, PlayerProfile } from "./build-schema.js";

/**
 * Pair schema v1 — two build snapshots + optional per-side profile snapshots +
 * optional user label. Embeds full `Build`s (not references) so a pair
 * survives the original single builds' 30-day TTL.
 *
 * See docs/superpowers/specs/2026-04-20-build-comparison-design.md §4.4.
 */
export const BuildPairV1 = z.object({
  v: z.literal(1),
  createdAt: z.string().datetime(),
  left: Build.nullable(),
  right: Build.nullable(),
  leftProfile: PlayerProfile.optional(),
  rightProfile: PlayerProfile.optional(),
  name: z.string().max(60).optional(),
  description: z.string().max(280).optional(),
});

export type BuildPairV1 = z.infer<typeof BuildPairV1>;

/**
 * Discriminated union over all known pair versions — follows the same
 * pattern as `Build`. Add a new variant per schema bump; never mutate
 * existing variants. Zod's discriminator key is `v` (not `version`, to avoid
 * collision with embedded `Build.version`).
 */
export const BuildPair = z.discriminatedUnion("v", [BuildPairV1]);
export type BuildPair = z.infer<typeof BuildPair>;

export const CURRENT_PAIR_VERSION = 1 as const;
