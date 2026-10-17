import { describe, expect, it } from "vitest";
import { weaponSpec } from "@tarkov/ballistics";
import { fixtureClient } from "./__fixtures__/client.js";
import oracle from "./__fixtures__/preset-oracle-sample.json" with { type: "json" };
import { fetchPartCatalog, partsById } from "./queries/parts.js";
import { fetchWeaponList } from "./queries/weaponList.js";
import { fetchWeaponTree } from "./queries/weaponTree.js";
import { presetRecordSchema, selectWeaponPresets } from "./queries/presets.js";
import { attachedParts } from "./attached-parts.js";
import { adaptMod, adaptWeapon } from "./ballistic-adapters.js";
import type { ItemsDocument } from "./queries/documents.js";

/**
 * Upstream's own presets are the ground truth this guards: placed by the real placer
 * (`selectWeaponPresets`), every part of a real preset must reproduce the preset's
 * ergonomics and recoil through the Builder's stat path.
 *
 * One upstream convention needs care. A preset lists a repeated part once with a `count`
 * (the M700 MRS: 3× KeyMod rail), and upstream's preset stats count each DISTINCT part once.
 * The Builder counts every physical part, matching `attachedParts` and, as an unverified
 * assumption, the in-game sum over fitted mods. So the oracle is checked over distinct parts,
 * and the per-part figure must differ from it by exactly the extra copies.
 */
const PRESETS = [
  "5af08cf886f774223c269184", // Colt M4A1 "Carbine" default: barrel, scope, magazine
  "5c0c1d6586f7743e5335d264", // Remington Model 700 default: 32 ergo upstream
  "5d38517786f7742a1468cf6a", // Remington Model 700 MRS: 3× KeyMod rail, fractional ergonomics
  "59e8d2ab86f77407f03fc9c2", // Kalashnikov AKM default
  "624d7a3691f0160c7324c3f4", // Chiappa Rhino 50DS default: a cylinder magazine with slots
  "5a43a85186f7746c914b947a", // AKS-74UN "Zenit": 30 loaded rounds, an ambiguous placement
];
const M700_MRS = "5d38517786f7742a1468cf6a";
const KEYMOD_RAIL = "5a9d6d00a2750c5c985b5305";

const client = fixtureClient({ items: oracle });

async function statsOf(presetId: string) {
  const [doc, weapons, parts] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchWeaponList(client),
    fetchPartCatalog(client),
  ]);
  const record = presetRecordSchema.parse(doc.items[presetId]);
  const weaponId = record.properties.baseItem;
  const tree = await fetchWeaponTree(client, weaponId);
  const preset = selectWeaponPresets(doc, tree.graph).byWeapon[weaponId]?.find(
    (p) => p.id === presetId,
  );
  if (preset === undefined) throw new Error(`preset ${presetId} was not placed`);

  const byId = partsById(parts);
  const { entries, missing } = attachedParts(tree, preset.attachments, byId);
  const weapon = adaptWeapon(weapons.find((w) => w.id === weaponId)!);
  const perPart = weaponSpec(
    weapon,
    entries.map((e) => adaptMod(e.part)),
  );
  const distinctParts = [...new Map(entries.map((e) => [e.part.id, e.part])).values()];
  const distinct = weaponSpec(weapon, distinctParts.map(adaptMod));
  return { doc, record, entries, missing, perPart, distinct, byId, weapon };
}

describe("weaponSpec over every part of a real preset", () => {
  it.each(PRESETS)("matches upstream preset %s over distinct parts", async (presetId) => {
    const { record, missing, distinct } = await statsOf(presetId);
    expect(missing).toEqual([]);
    expect(distinct.ergonomics).toBeCloseTo(record.properties.ergonomics, 6);
    expect(
      Math.abs(distinct.verticalRecoil - record.properties.recoilVertical),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(distinct.horizontalRecoil - record.properties.recoilHorizontal),
    ).toBeLessThanOrEqual(0.5);
  });

  it.each(PRESETS.filter((id) => id !== M700_MRS))(
    "counts each part of %s once, so per-part and distinct agree",
    async (presetId) => {
      const { perPart, distinct } = await statsOf(presetId);
      expect(perPart).toEqual(distinct);
    },
  );

  it("counts all three MRS rails, off upstream by exactly the two extra copies", async () => {
    const { record, entries, perPart, distinct, byId } = await statsOf(M700_MRS);
    expect(entries.filter((e) => e.part.id === KEYMOD_RAIL)).toHaveLength(3);
    const rail = adaptMod(byId.get(KEYMOD_RAIL)!);
    expect(rail.ergonomicsDelta).toBe(-0.15);
    expect(perPart.ergonomics).toBeCloseTo(
      record.properties.ergonomics + 2 * rail.ergonomicsDelta,
      6,
    );
    expect(perPart.weight).toBeCloseTo(distinct.weight + 2 * rail.weight, 9);
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
    const { doc, record, entries, perPart, byId, weapon } = await statsOf(AKS74UN_PRESET);
    // The rounds sit in the magazine, which no slot models; the placer leaves them out.
    expect(entries.map((e) => e.part.id)).not.toContain(CARTRIDGE);
    expect(record.properties.recoilVertical).toBe(67);
    expect(perPart.verticalRecoil).toBeCloseTo(67, 0);

    const raw = doc.items[CARTRIDGE] as { properties: { recoilModifier: number } };
    expect(raw.properties.recoilModifier).toBe(0.07);
    const withRound = weaponSpec(weapon, [
      ...entries.map((e) => adaptMod(e.part)),
      { ...adaptMod(byId.get(CARTRIDGE)!), recoilModifier: raw.properties.recoilModifier },
    ]);
    expect(withRound.verticalRecoil).toBeCloseTo(74.5, 0);
    // adaptMod applies the preset's rule: the round adds weight, not recoil.
    expect(adaptMod(byId.get(CARTRIDGE)!).recoilModifier).toBe(0);
  });
});
