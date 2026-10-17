/**
 * The Builder's one price model.
 *
 * An item's price under a gate is the price of the cheapest path the gate lets it use, as
 * {@link itemAvailability} picks it; nothing else in the codebase chooses between offers.
 *
 * **The rule for a missing price.** A flea entry the price table holds with no listing
 * (`unlisted`) is not a path: the item cannot be bought there. Any other missing price — a
 * barter whose ingredient has no flea price, an offer the live table no longer carries, or
 * every price while live prices are loading or after they failed — leaves the path open at
 * an unknown price. Unknown is never 0, and one unknown price makes a total unknown.
 */
import type { PlayerProfile } from "./build-schema.js";
import {
  itemAvailability,
  type AvailabilityInput,
  type ItemAvailability,
  type PriceGate,
} from "./item-availability.js";
import type { BuilderMode } from "./preset-seed.js";
import type { BuyForEntry } from "./queries/shared/buy-for.js";

export type { PriceGate } from "./item-availability.js";

type Obtainable = Extract<ItemAvailability, { available: true }>;

/**
 * The Builder's mode from its "Show all" toggle: on is theorycraft. Until the real mode
 * (#241) exists, this is the one place the toggle becomes a mode, for preset seeding and
 * prices alike.
 */
export function builderMode(showAll: boolean): BuilderMode {
  return showAll ? "theorycraft" : "progression";
}

/** Whose gates price the build: the profile in progression mode, none in theorycraft. */
export function priceGate(mode: BuilderMode, profile: PlayerProfile): PriceGate {
  return mode === "theorycraft" ? null : profile;
}

/**
 * The price of the cheapest path `gate` can use to obtain `item`, or `null` when it can use
 * none, or the cheapest one it can use has no known price. See the module comment for what a
 * missing price means; callers that need to tell the two `null`s apart, or name the source,
 * read {@link itemAvailability}, which this is the projection of.
 */
export function priceUnder(gate: PriceGate, item: AvailabilityInput): number | null {
  const availability = itemAvailability(item, gate);
  return availability.available ? availability.priceRUB : null;
}

/** A preset the weapon can be bought as, and the parts it comes with. */
export interface PresetContents {
  readonly id: string;
  /** Slot path → item id, as in a build. */
  readonly attachments: Readonly<Record<string, string>>;
  /**
   * Offers on the preset item itself, such as its own flea listing. Merged with the weapon's
   * offers tagged with this preset, so an offer listed in both counts once in effect.
   */
  readonly buyFor?: readonly BuyForEntry[] | null;
}

/** One way to buy the weapon: the bare receiver, or one of its presets. */
export interface WeaponPath {
  /** The preset bought, or `null` for the receiver itself. */
  readonly presetId: string | null;
  readonly availability: Obtainable;
  /** Item id → how many of it the path supplies. Empty for the receiver. */
  readonly covers: ReadonlyMap<string, number>;
}

function countItems(attachments: Readonly<Record<string, string>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of Object.values(attachments)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Every path `gate` can use to buy `weapon`: its own offers, and each preset that sells it.
 *
 * A preset offer on the weapon names its preset; when `presets` gives that preset's
 * contents, the path supplies them. Without contents a preset path supplies nothing, so a
 * build bought through it pays for its parts again.
 */
export function weaponPaths(
  gate: PriceGate,
  weapon: AvailabilityInput,
  presets: readonly PresetContents[] = [],
): WeaponPath[] {
  const own: BuyForEntry[] = [];
  const byPreset = new Map<string, BuyForEntry[]>();
  for (const entry of weapon.buyFor ?? []) {
    if (entry.preset === undefined) {
      own.push(entry);
      continue;
    }
    const list = byPreset.get(entry.preset.id);
    if (list === undefined) byPreset.set(entry.preset.id, [entry]);
    else list.push(entry);
  }
  const contents = new Map(presets.map((p) => [p.id, p]));
  for (const preset of presets) {
    if (!byPreset.has(preset.id)) byPreset.set(preset.id, []);
  }

  const paths: WeaponPath[] = [];
  const add = (presetId: string | null, buyFor: readonly BuyForEntry[]) => {
    const availability = itemAvailability({ buyFor, types: weapon.types }, gate);
    if (!availability.available) return;
    const preset = presetId === null ? undefined : contents.get(presetId);
    paths.push({
      presetId,
      availability,
      covers: preset === undefined ? new Map() : countItems(preset.attachments),
    });
  };
  add(null, own);
  for (const [presetId, entries] of byPreset) {
    add(presetId, [...entries, ...(contents.get(presetId)?.buyFor ?? [])]);
  }
  return paths;
}

/** A part on the build, as {@link buildPriceUnder} prices it. */
export interface PricedPart extends AvailabilityInput {
  readonly id: string;
}

export interface BuildPriceInput {
  readonly weapon: AvailabilityInput & { readonly id: string };
  /** The parts on the weapon, one entry per filled slot: a part fitted twice is listed twice. */
  readonly parts: readonly PricedPart[];
  /** The weapon's presets, so a preset's own parts are not paid for twice. */
  readonly presets?: readonly PresetContents[];
}

export type BuildPrice =
  | {
      readonly status: "priced";
      readonly totalRUB: number;
      /** The preset the weapon is bought as, or `null` for the receiver. */
      readonly presetId: string | null;
    }
  | {
      /** Obtainable, but some price on the cheapest path is not known. */
      readonly status: "unknown";
      /** The sum of the prices that are known. Not a total. */
      readonly knownRUB: number;
      /** Ids whose price is not known: the weapon's, or parts'. */
      readonly unpriced: readonly string[];
      readonly presetId: string | null;
    }
  | {
      readonly status: "unobtainable";
      /** The weapon's id when no path buys it, else the parts no path can get. */
      readonly missing: readonly string[];
    };

interface PathTotal {
  readonly presetId: string | null;
  readonly knownRUB: number;
  readonly unpriced: string[];
  readonly missing: string[];
}

function totalFor(gate: PriceGate, path: WeaponPath, input: BuildPriceInput): PathTotal {
  const remaining = new Map(path.covers);
  const unpriced: string[] = [];
  const missing: string[] = [];
  let knownRUB = 0;
  if (path.availability.priceRUB === null) unpriced.push(input.weapon.id);
  else knownRUB += path.availability.priceRUB;
  for (const part of input.parts) {
    const supplied = remaining.get(part.id) ?? 0;
    if (supplied > 0) {
      remaining.set(part.id, supplied - 1);
      continue;
    }
    const availability = itemAvailability(part, gate);
    if (!availability.available) missing.push(part.id);
    else if (availability.priceRUB === null) unpriced.push(part.id);
    else knownRUB += availability.priceRUB;
  }
  return { presetId: path.presetId, knownRUB, unpriced, missing };
}

/**
 * What the build costs under `gate`: the weapon bought by its cheapest path plus every part
 * that path does not supply, minimised over the paths. A preset that comes with the build's
 * barrel and stock may beat a cheaper bare receiver.
 *
 * A path that leaves some part unobtainable does not count. Among the rest, a fully priced
 * path beats one with an unknown price, as in {@link itemAvailability}, and fewer unknown
 * prices beat more: a path is not cheaper for leaving its own price out of the known sum. Ties
 * go to the lower known sum, then the receiver, then preset id.
 */
export function buildPriceUnder(gate: PriceGate, input: BuildPriceInput): BuildPrice {
  const paths = weaponPaths(gate, input.weapon, input.presets);
  if (paths.length === 0) return { status: "unobtainable", missing: [input.weapon.id] };

  const totals = paths.map((path) => totalFor(gate, path, input));
  const complete = totals.filter((t) => t.missing.length === 0);
  if (complete.length === 0) {
    const fewest = [...totals].sort((a, b) => a.missing.length - b.missing.length)[0]!;
    return { status: "unobtainable", missing: fewest.missing };
  }
  const order = (a: PathTotal, b: PathTotal): number =>
    a.unpriced.length - b.unpriced.length ||
    a.knownRUB - b.knownRUB ||
    Number(a.presetId !== null) - Number(b.presetId !== null) ||
    // Only one path is the receiver's, so both are presets here.
    Number(String(a.presetId) > String(b.presetId)) -
      Number(String(a.presetId) < String(b.presetId));
  const best = complete.sort(order)[0]!;
  if (best.unpriced.length === 0) {
    return { status: "priced", totalRUB: best.knownRUB, presetId: best.presetId };
  }
  return {
    status: "unknown",
    knownRUB: best.knownRUB,
    unpriced: best.unpriced,
    presetId: best.presetId,
  };
}
