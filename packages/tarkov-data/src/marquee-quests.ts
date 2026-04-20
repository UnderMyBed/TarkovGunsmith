/**
 * 20 marquee quests that gate the most-impactful mod/ammo unlocks. Curated
 * by `normalizedName` (stable across name localizations). Updating this list
 * does not require a schema change — it's a data constant.
 */
export const MARQUEE_QUEST_NORMALIZED_NAMES: readonly string[] = [
  "gunsmith-part-1",
  "gunsmith-part-2",
  "gunsmith-part-3",
  "gunsmith-part-4",
  "gunsmith-part-5",
  "gunsmith-part-6",
  "gunsmith-part-7",
  "gunsmith-part-8",
  "gunsmith-part-9",
  "gunsmith-part-10",
  "shooter-born-in-heaven",
  "psycho-sniper",
  "setup",
  "fishing-gear",
  "eagle-eye",
  "the-tarkov-shooter-part-1",
  "the-tarkov-shooter-part-2",
  "the-tarkov-shooter-part-3",
  "the-tarkov-shooter-part-4",
  "the-tarkov-shooter-part-5",
] as const;
