/**
 * Quests that gate the most-impactful mod and ammo unlocks, curated by `normalizedName`
 * (stable across name localizations). Updating these lists does not require a schema change —
 * they are data constants.
 *
 * Upstream restructured the Gunsmith series: `gunsmith-part-1` … `-10` no longer exist.
 * There is now a 13-part "Gunsmith - Master" series plus 13 weapon-specific quests, and all
 * 26 are adopted because they gate exactly the mods a weapon builder cares about. Builds
 * saved before that change are handled by `migrateV4ToV5`.
 */
const GUNSMITH_MASTER = [
  "gunsmith-master-part-1",
  "gunsmith-master-part-2",
  "gunsmith-master-part-3",
  "gunsmith-master-part-4",
  "gunsmith-master-part-5",
  "gunsmith-master-part-6",
  "gunsmith-master-part-7",
  "gunsmith-master-part-8",
  "gunsmith-master-part-9",
  "gunsmith-master-part-10",
  "gunsmith-master-part-11",
  "gunsmith-master-part-12",
  "gunsmith-master-part-13",
] as const;

const GUNSMITH_WEAPON = [
  "gunsmith-ak-105",
  "gunsmith-akm",
  "gunsmith-aks-74n",
  "gunsmith-aks-74u",
  "gunsmith-as-val",
  "gunsmith-hk-mp5",
  "gunsmith-m4a1",
  "gunsmith-model-870",
  "gunsmith-mp-133",
  "gunsmith-mpx",
  "gunsmith-op-sks",
  "gunsmith-p226r",
  "gunsmith-vector-9x19",
] as const;

const OTHER_MARQUEE = [
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

export const MARQUEE_QUEST_NORMALIZED_NAMES: readonly string[] = [
  ...GUNSMITH_MASTER,
  ...GUNSMITH_WEAPON,
  ...OTHER_MARQUEE,
];
