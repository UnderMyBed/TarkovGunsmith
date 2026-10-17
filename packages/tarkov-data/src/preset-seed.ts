import type { PlayerProfile } from "./build-schema.js";
import { itemAvailability, type ItemAvailability, type PriceGate } from "./item-availability.js";
import type { BuyForEntry } from "./queries/shared/buy-for.js";
import type { WeaponPreset } from "./queries/presets.js";

/**
 * How the Builder treats the player's progression.
 *
 * - `theorycraft`: everything is fair game; no gating.
 * - `progression`: what the profile can actually obtain right now.
 */
export type BuilderMode = "theorycraft" | "progression";

/**
 * Whether `gate` (a profile, or `null` in theorycraft) can buy this preset as a whole: its
 * trader offers and barters (the entries its weapon's offers carry tagged with this preset)
 * and its own flea listing, as `snapshotWeaponPresets` prices them. The flea listing is the
 * preset's, not the weapon's: an assembled preset is listed on the flea in its own right, at
 * its own price (329 of the 399 live weapon presets are), while the weapon's flea offer is the
 * bare receiver's.
 *
 * `types` is empty because the snapshot already left out the flea listing of a preset upstream
 * flags `noFlea`, which is the only thing `itemAvailability` reads `types` for.
 */
export function presetAvailability(
  preset: { readonly buyFor: readonly BuyForEntry[] },
  gate: PriceGate,
): ItemAvailability {
  return itemAvailability({ buyFor: preset.buyFor, types: [] }, gate);
}

export interface PresetSeed {
  readonly preset: WeaponPreset;
  /** `null` in theorycraft mode; otherwise whether the profile can buy this preset. */
  readonly availability: ItemAvailability | null;
}

type Obtainable = Extract<ItemAvailability, { available: true }>;

/** Code-unit order: the same on every runtime, unlike `localeCompare`. */
const compareText = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** Known prices ascending, unknown (`null`) last. */
function byPrice(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The preset a new build of this weapon starts from, or `null` when the weapon has none.
 *
 * - `theorycraft`: the default preset.
 * - `progression`: the default preset when the profile can buy it. Otherwise the cheapest
 *   preset it can buy (known price ascending, unknown price last, then short name, then id):
 *   the best gun the player can actually get right now. When it can buy none, the default,
 *   with its unmet requirement in `availability` so the Builder can say why.
 *
 * `presets` is one weapon's list from the snapshot (`selectWeaponPresets`), which leaves out any weapon
 * without exactly one default; a list without one is a contract break and throws.
 * `availabilityOf` is {@link presetAvailability} for each preset id.
 */
export function seedPreset(
  presets: readonly WeaponPreset[],
  mode: BuilderMode,
  availabilityOf: (presetId: string) => ItemAvailability,
): PresetSeed | null {
  if (presets.length === 0) return null;
  const fallback = presets.find((p) => p.isDefault);
  if (fallback === undefined) {
    throw new Error(`no default preset among ${presets.map((p) => p.id).join(", ")}`);
  }
  if (mode === "theorycraft") return { preset: fallback, availability: null };

  const fallbackAvailability = availabilityOf(fallback.id);
  if (fallbackAvailability.available) {
    return { preset: fallback, availability: fallbackAvailability };
  }
  const obtainable: { preset: WeaponPreset; availability: Obtainable }[] = [];
  for (const preset of presets) {
    const availability = availabilityOf(preset.id);
    if (availability.available) obtainable.push({ preset, availability });
  }
  obtainable.sort(
    (a, b) =>
      byPrice(a.availability.priceRUB, b.availability.priceRUB) ||
      compareText(a.preset.shortName, b.preset.shortName) ||
      compareText(a.preset.id, b.preset.id),
  );
  return obtainable[0] ?? { preset: fallback, availability: fallbackAvailability };
}

/**
 * The attachments a new build of a weapon starts with: {@link seedPreset}'s pick from the
 * weapon's presets, or none for a weapon without presets. `presets` is the weapon's list from
 * `snapshotWeaponPresets`; `profile` is read only in `progression` mode.
 */
export function seedAttachments(
  presets: readonly (WeaponPreset & { readonly buyFor: readonly BuyForEntry[] })[],
  mode: BuilderMode,
  profile: PlayerProfile,
): Record<string, string> {
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const seed = seedPreset(presets, mode, (id) => presetAvailability(byId.get(id)!, profile));
  return seed === null ? {} : { ...seed.preset.attachments };
}
