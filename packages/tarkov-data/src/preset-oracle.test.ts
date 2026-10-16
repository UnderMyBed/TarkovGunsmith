import { describe, expect, it } from "vitest";
import { weaponSpec } from "@tarkov/ballistics";
import { fixtureClient } from "./__fixtures__/client.js";
import oracle from "./__fixtures__/preset-oracle-sample.json" with { type: "json" };
import { fetchPartCatalog, partsById } from "./queries/parts.js";
import { fetchWeaponList } from "./queries/weaponList.js";
import { fetchWeaponTree } from "./queries/weaponTree.js";
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

describe("weaponSpec over every part of a real preset", () => {
  it.each(PRESETS)("matches upstream preset %s", async (presetId) => {
    const [doc, weapons, parts] = await Promise.all([
      client.fetchResource<ItemsDocument>("items"),
      fetchWeaponList(client),
      fetchPartCatalog(client),
    ]);
    const preset = doc.items[presetId] as PresetRecord;
    const weaponId = preset.properties.baseItem;
    const tree = await fetchWeaponTree(client, weaponId);
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
    expect(pending, "parts the slot graph could not place").toEqual([]);

    const { entries, missing } = attachedParts(attachments, byId);
    expect(missing).toEqual([]);
    const weapon = weapons.find((w) => w.id === weaponId)!;
    const spec = weaponSpec(
      adaptWeapon(weapon),
      entries.map((e) => adaptMod(e.part)),
    );

    expect(spec.ergonomics).toBeCloseTo(preset.properties.ergonomics, 6);
    expect(Math.abs(spec.verticalRecoil - preset.properties.recoilVertical)).toBeLessThanOrEqual(
      0.5,
    );
    expect(
      Math.abs(spec.horizontalRecoil - preset.properties.recoilHorizontal),
    ).toBeLessThanOrEqual(0.5);
  });
});
