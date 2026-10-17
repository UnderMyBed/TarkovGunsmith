import { describe, expect, it } from "vitest";
import {
  fixturePartCatalog,
  fixtureWeaponList,
  fixtureWeaponTree,
} from "./__test-utils__/fixture-snapshot.js";
import { weaponSpec } from "@tarkov/ballistics";
import { fixtureClient } from "./__fixtures__/client.js";
import oracle from "./__fixtures__/preset-oracle-sample.json" with { type: "json" };
import { partsById, snapshotPartSchema, type AttachablePart } from "./queries/parts.js";
import { visibleSlots } from "./queries/slot-graph.js";
import { attachedParts } from "./attached-parts.js";
import { adaptMod, adaptWeapon } from "./ballistic-adapters.js";
import type { ItemsDocument } from "./queries/documents.js";

/**
 * Upstream's own presets are the ground truth this guards: fed every part of a real preset, the
 * Builder's stat path must reproduce the preset's ergonomics and recoil. Before #213/#214 it
 * could not — barrels, scopes and magazines were not in the catalog, and their slots were not in
 * the tree, so the M700 default read 64 ergonomics against upstream's 32.
 *
 * The parts are placed through the slot graph the way a player would (each into the first empty
 * slot that shows and allows it), so this also proves every part of each preset is reachable.
 */
const PRESETS = [
  "5af08cf886f774223c269184", // Colt M4A1 "Carbine" default: barrel, scope, magazine
  "5c0c1d6586f7743e5335d264", // Remington Model 700 default: 32 ergo upstream
  "5d38517786f7742a1468cf6a", // Remington Model 700 MRS: fractional ergonomics
  "59e8d2ab86f77407f03fc9c2", // Kalashnikov AKM default
  "624d7a3691f0160c7324c3f4", // Chiappa Rhino 50DS default: a cylinder magazine with slots
];

interface PresetRecord {
  properties: {
    baseItem: string;
    ergonomics: number;
    recoilVertical: number;
    recoilHorizontal: number;
  };
  containsItems: { item: string; count: number }[];
}

const client = fixtureClient({ items: oracle });

/**
 * Place a preset's parts through the slot graph, greedily, as a player would. Returns what was
 * placed and what found no slot.
 */
async function placePreset(presetId: string) {
  const [doc, weapons, parts] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fixtureWeaponList(client),
    fixturePartCatalog(client),
  ]);
  const preset = doc.items[presetId] as PresetRecord;
  const weaponId = preset.properties.baseItem;
  const tree = await fixtureWeaponTree(client, weaponId);
  const byId = partsById(parts);

  const pending = preset.containsItems.map((c) => c.item).filter((id) => id !== weaponId);
  const attachments: Record<string, string> = {};
  for (let progress = true; progress;) {
    progress = false;
    for (const slot of visibleSlots(tree, attachments)) {
      if (attachments[slot.path] !== undefined) continue;
      const i = pending.findIndex((id) => slot.allowedItemIds.has(id));
      if (i < 0) continue;
      attachments[slot.path] = pending[i]!;
      pending.splice(i, 1);
      progress = true;
    }
  }
  const { entries, missing } = attachedParts(tree, attachments, byId);
  const weapon = adaptWeapon(weapons.find((w) => w.id === weaponId)!);
  const mods = entries.map((e) => adaptMod(e.part));
  return { doc, preset, byId, pending, missing, weapon, mods };
}

describe("weaponSpec over every part of a real preset", () => {
  it.each(PRESETS)("matches upstream preset %s", async (presetId) => {
    const { preset, pending, missing, weapon, mods } = await placePreset(presetId);
    expect(pending, "parts the slot graph could not place").toEqual([]);
    expect(missing).toEqual([]);
    const spec = weaponSpec(weapon, mods);

    expect(spec.ergonomics).toBeCloseTo(preset.properties.ergonomics, 6);
    expect(Math.abs(spec.verticalRecoil - preset.properties.recoilVertical)).toBeLessThanOrEqual(
      0.5,
    );
    expect(
      Math.abs(spec.horizontalRecoil - preset.properties.recoilHorizontal),
    ).toBeLessThanOrEqual(0.5);
  });
});

/**
 * The evidence behind `adaptMod` giving ammo no stat modifiers. No live preset places a cartridge
 * in a revolver `camora_*` slot, but magazine-loaded presets carry cartridges, and upstream's
 * recoil for them leaves the cartridge's `recoilModifier` out.
 */
describe("cartridge recoil in an upstream preset", () => {
  const AKS74UN_PRESET = "5a43a85186f7746c914b947a"; // AKS-74UN loaded with 30 rounds
  const CARTRIDGE = "56dfef82d2720bbd668b4567"; // recoilModifier 0.07 upstream

  it("is excluded: 67 upstream, which counting the round once would make 74.5", async () => {
    const { doc, preset, pending, weapon, mods } = await placePreset(AKS74UN_PRESET);
    // The cartridges sit in the magazine, which no slot models; everything else is placed.
    expect(pending).toEqual([CARTRIDGE]);
    expect(preset.properties.recoilVertical).toBe(67);

    expect(weaponSpec(weapon, mods).verticalRecoil).toBeCloseTo(67, 0);

    const raw = doc.items[CARTRIDGE] as { properties: { recoilModifier: number } };
    expect(raw.properties.recoilModifier).toBe(0.07);
    // A magazine-loaded round is reachable through no slot, so the Builder catalog does not
    // carry it; parse it through the same part schema to ask adaptMod about it.
    const round: AttachablePart = { ...snapshotPartSchema.parse(raw), buyFor: [] };
    const withRound = weaponSpec(weapon, [
      ...mods,
      { ...adaptMod(round), recoilModifier: raw.properties.recoilModifier },
    ]);
    expect(withRound.verticalRecoil).toBeCloseTo(74.5, 0);
    // adaptMod applies the preset's rule: the round adds weight, not recoil.
    expect(adaptMod(round).recoilModifier).toBe(0);
  });
});
