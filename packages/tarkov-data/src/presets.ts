/**
 * Hand-curated weapon preset loadouts, keyed by weaponId.
 *
 * Each weapon may have 0+ named presets (e.g. "Stock", "Meta", "Budget").
 * Applying a preset fills the attachments record fresh (overwrite, not merge).
 *
 * Empty by default — populating this map is a content-only follow-up PR that
 * doesn't require a schema change. The PresetPicker component hides itself
 * when a weapon has no presets, so shipping an empty map is safe.
 */
export interface WeaponPreset {
  name: string;
  /** SlotPath → ItemId map (same shape as BuildV2+ `attachments`). */
  attachments: Readonly<Record<string, string>>;
}

export const WEAPON_PRESETS: Readonly<Record<string, readonly WeaponPreset[]>> = {
  // Populate in a follow-up data PR.
};

const EMPTY_PRESETS: readonly WeaponPreset[] = [];

/** Look up presets for a weapon. Returns an empty array if the weapon has none (stable reference). */
export function presetsForWeapon(weaponId: string): readonly WeaponPreset[] {
  return WEAPON_PRESETS[weaponId] ?? EMPTY_PRESETS;
}
