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
  /** Weapon id → its presets: exactly one default, listed first, then the rest in document order. */
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

/**
 * Place one upstream preset, by id.
 *
 * Returns `null` for an item that is not a weapon preset the Builder holds: not a preset at
 * all, or a preset on gear (body armour, rigs, helmets) or on a special-slot item. A preset
 * whose `baseItem` is missing, not a string, or names an item the document lacks is a
 * failure, not a skip: that is what an upstream rename looks like, and skipping it would empty
 * every weapon's presets without a word.
 */
export function selectWeaponPreset(
  doc: ItemsDocument,
  graph: SlotGraph,
  presetId: string,
): WeaponPreset | PresetFailure | null {
  const item = doc.items[presetId];
  const candidate = item as RawItem | undefined;
  if (candidate?.properties?.propertiesType !== "ItemPropertiesPreset") return null;
  const baseItem = candidate.properties.baseItem;
  if (typeof baseItem !== "string") {
    return { id: presetId, reason: "schema", detail: "properties.baseItem: expected a string" };
  }
  const base = doc.items[baseItem] as RawItem | undefined;
  if (base === undefined) return { id: presetId, reason: "unknown-items", detail: baseItem };
  if (base.properties?.propertiesType !== "ItemPropertiesWeapon") return null;
  // Every upstream weapon carries `types` (the weapon list's schema requires it).
  if (!isBuildableWeapon({ types: base.types as readonly string[] })) return null;

  const parsed = presetRecordSchema.safeParse(item);
  if (!parsed.success) {
    return { id: presetId, reason: "schema", detail: describeIssues(parsed.error) };
  }
  const preset = parsed.data;
  const parts = preset.containsItems
    .filter((entry) => entry.item !== baseItem)
    .map((entry) => ({ itemId: entry.item, count: entry.count }));

  const unknown = parts.filter((p) => doc.items[p.itemId] === undefined).map((p) => p.itemId);
  if (unknown.length > 0) {
    return { id: presetId, reason: "unknown-items", detail: unknown.join(", ") };
  }

  const fields = new Map<string, z.infer<typeof presetPartSchema>>();
  const partProblems: string[] = [];
  for (const { itemId } of parts) {
    const part = presetPartSchema.safeParse(doc.items[itemId]);
    if (part.success) fields.set(itemId, part.data);
    else partProblems.push(`${itemId}: ${describeIssues(part.error)}`);
  }
  if (partProblems.length > 0) {
    return { id: presetId, reason: "schema", detail: partProblems.join("; ") };
  }

  const placement = placePreset({
    tree: selectWeaponTree(doc, baseItem, graph),
    parts,
    isCartridge: (id) => (fields.get(id) as { types: string[] }).types.includes("ammo"),
    conflicts: fields,
  });
  if (!placement.placed) {
    return { id: presetId, reason: placement.reason, detail: placement.itemIds.join(", ") };
  }
  return {
    id: preset.id,
    name: preset.name,
    shortName: preset.shortName,
    weaponId: baseItem,
    isDefault: preset.properties.default,
    attachments: placement.attachments,
  };
}

/**
 * Pure core: every buildable weapon's upstream presets, placed into the slot graph.
 *
 * Every weapon in `byWeapon` has exactly one default preset, listed first. Anything that
 * breaks that is reported in `failures` rather than returned: a preset that fails its schema,
 * names an item the document lacks or cannot be placed (see {@link selectWeaponPreset}), and a
 * weapon whose placed presets do not include exactly one default, which is left out of
 * `byWeapon` altogether.
 */
export function selectWeaponPresets(doc: ItemsDocument, graph: SlotGraph): WeaponPresets {
  const placed: Record<string, WeaponPreset[]> = {};
  const failures: PresetFailure[] = [];

  for (const presetId of Object.keys(doc.items)) {
    const result = selectWeaponPreset(doc, graph, presetId);
    if (result === null) continue;
    if ("reason" in result) failures.push(result);
    else (placed[result.weaponId] ??= []).push(result);
  }

  const byWeapon: Record<string, WeaponPreset[]> = {};
  for (const [weaponId, presets] of Object.entries(placed)) {
    const defaults = presets.filter((p) => p.isDefault).length;
    if (defaults !== 1) {
      failures.push({
        id: weaponId,
        reason: "default-count",
        detail: `${defaults} default presets`,
      });
      continue;
    }
    byWeapon[weaponId] = [
      ...presets.filter((p) => p.isDefault),
      ...presets.filter((p) => !p.isDefault),
    ];
  }
  return { byWeapon, failures };
}
