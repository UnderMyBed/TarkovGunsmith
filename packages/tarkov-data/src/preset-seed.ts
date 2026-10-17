import type { PlayerProfile } from "./build-schema.js";
import {
  itemAvailability,
  type AvailabilityInput,
  type ItemAvailability,
} from "./item-availability.js";
import type { WeaponPreset } from "./queries/presets.js";

/**
 * How the Builder treats the player's progression.
 *
 * - `theorycraft`: everything is fair game; no gating.
 * - `progression`: what the profile can actually obtain right now.
 */
export type BuilderMode = "theorycraft" | "progression";

/**
 * Whether the profile can buy this preset as a whole: the weapon's offers that sell exactly
 * this preset (`buyFor` entries tagged with its id, cash or barter), run through
 * {@link itemAvailability}. A preset with no such offer reads `no-sources`.
 */
export function presetAvailability(
  weapon: AvailabilityInput,
  presetId: string,
  profile: PlayerProfile,
): ItemAvailability {
  const offers = (weapon.buyFor ?? []).filter((entry) => entry.preset?.id === presetId);
  return itemAvailability({ buyFor: offers, types: weapon.types }, profile);
}

export interface PresetSeed {
  readonly preset: WeaponPreset;
  /** `null` in theorycraft mode; otherwise whether the profile can buy this preset. */
  readonly availability: ItemAvailability | null;
}

/**
 * The preset a new build of this weapon starts from, or `null` when the weapon has none.
 *
 * - `theorycraft`: the default preset.
 * - `progression`: the default preset when the profile can buy it; otherwise the first preset
 *   in `presets` order that it can buy; otherwise the default, with its unmet requirement in
 *   `availability` so the Builder can say why.
 *
 * `presets` is one weapon's list from `selectWeaponPresets`, which guarantees exactly one
 * default; a list without one is a contract break and throws.
 */
export function seedPreset(
  presets: readonly WeaponPreset[],
  weapon: AvailabilityInput,
  mode: BuilderMode,
  profile: PlayerProfile,
): PresetSeed | null {
  if (presets.length === 0) return null;
  const fallback = presets.find((p) => p.isDefault);
  if (fallback === undefined) {
    throw new Error(`no default preset among ${presets.map((p) => p.id).join(", ")}`);
  }
  if (mode === "theorycraft") return { preset: fallback, availability: null };

  const fallbackAvailability = presetAvailability(weapon, fallback.id, profile);
  if (fallbackAvailability.available)
    return { preset: fallback, availability: fallbackAvailability };
  for (const preset of presets) {
    const availability = presetAvailability(weapon, preset.id, profile);
    if (availability.available) return { preset, availability };
  }
  return { preset: fallback, availability: fallbackAvailability };
}
