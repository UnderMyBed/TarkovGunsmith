import { z } from "zod";
import type { ItemsDocument } from "./documents.js";
import { selectWeaponTree, type SlotGraph } from "./slot-graph.js";
import { isBuildableWeapon } from "./weaponList.js";
import { placePreset, type PresetPlacementFailure } from "../preset-placement.js";

/**
 * An upstream weapon preset (`ItemPropertiesPreset`), as far as the Builder reads it. The
 * stats are upstream's own figures for the assembled gun: the stat oracle (#220).
 */
export const presetRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  containsItems: z.array(z.object({ item: z.string(), count: z.number().int().positive() })),
  properties: z.object({
    propertiesType: z.literal("ItemPropertiesPreset"),
    baseItem: z.string(),
    default: z.boolean(),
    ergonomics: z.number(),
    recoilVertical: z.number(),
    recoilHorizontal: z.number(),
    moa: z.number(),
  }),
});

export type PresetRecord = z.infer<typeof presetRecordSchema>;

/** A preset placed into its weapon's slot graph: ready to become a build's attachments. */
export interface WeaponPreset {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly weaponId: string;
  /** Upstream's `properties.default`: the gun as it comes stock. */
  readonly isDefault: boolean;
  /** Slot path → item id, as in a build. */
  readonly attachments: Readonly<Record<string, string>>;
}

/**
 * A preset that could not be turned into a {@link WeaponPreset}, or a weapon whose presets
 * break the one-default rule.
 *
 * - `schema`: the record no longer matches {@link presetRecordSchema}.
 * - `unknown-items`: it lists ids the document does not hold.
 * - `default-count`: the weapon has no default preset, or more than one.
 * - otherwise a {@link PresetPlacementFailure}.
 */
export interface PresetFailure {
  /** The preset, or for `default-count` the weapon. */
  readonly id: string;
  readonly reason: "schema" | "unknown-items" | "default-count" | PresetPlacementFailure;
  readonly detail: string;
}

export interface WeaponPresets {
  /** Weapon id → its presets, the default first, then by short name. */
  readonly byWeapon: Readonly<Record<string, readonly WeaponPreset[]>>;
  readonly failures: readonly PresetFailure[];
}

/** What placement reads from each part a preset lists. */
const presetPartSchema = z.object({
  types: z.array(z.string()),
  conflictingItems: z.array(z.string()),
  conflictingSlotIds: z.array(z.string()),
});

interface RawItem {
  readonly types?: readonly string[];
  readonly properties?: { readonly propertiesType?: unknown; readonly baseItem?: unknown } | null;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

/** Code-unit order: the same on every runtime, unlike `localeCompare`. */
const compareText = (a: string, b: string): number => Number(a > b) - Number(a < b);

/**
 * Pure core: every buildable weapon's upstream presets, placed into the slot graph.
 *
 * Candidates are the `ItemPropertiesPreset` items whose `baseItem` is a buildable weapon. The
 * other upstream presets are body armour, rigs and helmets, which the Builder does not hold.
 * Nothing is dropped quietly: a candidate that fails its schema, names an item the document
 * lacks, or cannot be placed is reported in `failures`, and so is a weapon whose presets do not
 * include exactly one default.
 */
export function selectWeaponPresets(doc: ItemsDocument, graph: SlotGraph): WeaponPresets {
  const byWeapon: Record<string, WeaponPreset[]> = {};
  const failures: PresetFailure[] = [];

  for (const [key, item] of Object.entries(doc.items)) {
    const candidate = item as RawItem | null;
    if (candidate?.properties?.propertiesType !== "ItemPropertiesPreset") continue;
    const base = doc.items[String(candidate.properties.baseItem)] as RawItem | undefined;
    if (base?.properties?.propertiesType !== "ItemPropertiesWeapon") continue;
    // Every upstream weapon carries `types` (the weapon list's schema requires it).
    if (!isBuildableWeapon({ types: base.types as readonly string[] })) continue;

    const parsed = presetRecordSchema.safeParse(item);
    if (!parsed.success) {
      failures.push({ id: key, reason: "schema", detail: describeIssues(parsed.error) });
      continue;
    }
    const preset = parsed.data;
    const weaponId = preset.properties.baseItem;
    const parts = preset.containsItems
      .filter((entry) => entry.item !== weaponId)
      .map((entry) => ({ itemId: entry.item, count: entry.count }));

    const unknown = parts.filter((p) => doc.items[p.itemId] === undefined).map((p) => p.itemId);
    if (unknown.length > 0) {
      failures.push({ id: preset.id, reason: "unknown-items", detail: unknown.join(", ") });
      continue;
    }

    const fields = new Map<string, z.infer<typeof presetPartSchema>>();
    const partProblems: string[] = [];
    for (const { itemId } of parts) {
      const part = presetPartSchema.safeParse(doc.items[itemId]);
      if (part.success) fields.set(itemId, part.data);
      else partProblems.push(`${itemId}: ${describeIssues(part.error)}`);
    }
    if (partProblems.length > 0) {
      failures.push({ id: preset.id, reason: "schema", detail: partProblems.join("; ") });
      continue;
    }

    const placement = placePreset({
      tree: selectWeaponTree(doc, weaponId, graph),
      parts,
      isCartridge: (id) => (fields.get(id) as { types: string[] }).types.includes("ammo"),
      conflicts: fields,
    });
    if (!placement.placed) {
      failures.push({
        id: preset.id,
        reason: placement.reason,
        detail: placement.itemIds.join(", "),
      });
      continue;
    }
    (byWeapon[weaponId] ??= []).push({
      id: preset.id,
      name: preset.name,
      shortName: preset.shortName,
      weaponId,
      isDefault: preset.properties.default,
      attachments: placement.attachments,
    });
  }

  for (const [weaponId, presets] of Object.entries(byWeapon)) {
    const defaults = presets.filter((p) => p.isDefault).length;
    if (defaults !== 1) {
      failures.push({
        id: weaponId,
        reason: "default-count",
        detail: `${defaults} default presets`,
      });
    }
    presets.sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || compareText(a.shortName, b.shortName),
    );
  }
  return { byWeapon, failures };
}
