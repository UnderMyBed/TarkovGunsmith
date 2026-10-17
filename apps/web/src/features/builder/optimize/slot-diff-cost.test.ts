import { describe, expect, it } from "vitest";
import {
  adaptWeapon,
  partsById,
  snapshotPartCatalog,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
  type PlayerProfile,
} from "@tarkov/data";
import { optimize } from "@tarkov/optimizer";
import { capturedBuilderData } from "../../../test/captured-data.js";
import { coversOf, priceBuild } from "../build-price.js";
import { slotDiff, weaponChangeOf } from "./slot-diff.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_CARBINE = "5af08cf886f774223c269184";
const LL4: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 4, skier: 4, peacekeeper: 4, mechanic: 4, ragman: 4, jaeger: 4 },
  flea: true,
  level: 40,
};

describe("the changes table's prices against the build's cost", () => {
  it("sum to the change in the build's cost when the preset stays", async () => {
    const { snapshot, prices } = await capturedBuilderData();
    const table = prices.prices;
    const parts = snapshotPartCatalog(snapshot, table);
    const byId = partsById(parts);
    const weaponItem = snapshotWeaponList(snapshot, table).find((w) => w.id === M4A1)!;
    const tree = snapshotWeaponTree(snapshot, M4A1);
    const presets = snapshotWeaponPresets(snapshot, table)[M4A1] ?? [];
    // A new M4A1 build: the Carbine, as seeded.
    const current = { ...presets.find((p) => p.id === M4A1_CARBINE)!.attachments };
    const currentPrice = priceBuild(LL4, weaponItem, tree, current, byId, presets);
    expect(currentPrice).toEqual({ status: "priced", totalRUB: 26_666, presetId: M4A1_CARBINE });

    const result = optimize({
      weapon: adaptWeapon(weaponItem),
      weaponItem,
      presets,
      slotTree: tree,
      parts,
      objective: "min-recoil",
      constraints: { profile: LL4, pinnedSlots: new Map(), budgetRub: 60_000 },
    });
    if (!result.ok) throw new Error(`the solver found no build: ${result.reason}`);
    const proposedPrice = priceBuild(
      LL4,
      weaponItem,
      tree,
      result.build.attachments,
      byId,
      presets,
    );
    expect(proposedPrice).toEqual({ status: "priced", totalRUB: 57_749, presetId: M4A1_CARBINE });

    const rows = slotDiff(current, result.build.attachments, tree, byId, LL4, {
      current: coversOf(currentPrice, presets),
      proposed: coversOf(proposedPrice, presets),
    });
    // Every part swapped out came with the Carbine: nothing is refunded for them.
    const swapped = rows.filter((r) => r.currentName !== null);
    expect(swapped.length).toBeGreaterThan(0);
    expect(swapped.map((r) => r.currentPrice)).toEqual(swapped.map(() => 0));
    const rowsSum = rows.reduce((t, r) => t + r.priceDelta!, 0);
    expect(rowsSum).toBe(57_749 - 26_666);
    // Both buy the weapon as the Carbine, so there is no weapon line.
    expect(weaponChangeOf(currentPrice, proposedPrice, rows, String)).toBeNull();
  });
});
