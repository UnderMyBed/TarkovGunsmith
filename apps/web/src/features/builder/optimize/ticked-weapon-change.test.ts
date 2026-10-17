import { describe, expect, it } from "vitest";
import {
  adaptWeapon,
  partsById,
  snapshotPartCatalog,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
  type BuildV6,
  type PlayerProfile,
} from "@tarkov/data";
import { optimize } from "@tarkov/optimizer";
import { capturedBuilderData } from "../../../test/captured-data.js";
import { priceBuild } from "../build-price.js";
import { appliedSelection } from "./applied-selection.js";
import { tickedWeaponChange } from "./useOptimizeSession.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const LL4: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 4, skier: 4, peacekeeper: 4, mechanic: 4, ragman: 4, jaeger: 4 },
  flea: true,
  level: 40,
};

describe("tickedWeaponChange", () => {
  it("names how the ticked build buys the weapon, not how the full proposal would", async () => {
    const { snapshot, prices } = await capturedBuilderData();
    const table = prices.prices;
    const parts = snapshotPartCatalog(snapshot, table);
    const byId = partsById(parts);
    const weaponItem = snapshotWeaponList(snapshot, table).find((w) => w.id === M4A1)!;
    const tree = snapshotWeaponTree(snapshot, M4A1);
    const presets = snapshotWeaponPresets(snapshot, table)[M4A1] ?? [];
    const sopmod = presets.find((p) => /SOPMOD II/.test(p.name))!;
    const current: BuildV6 = {
      version: 6,
      weaponId: M4A1,
      attachments: { ...sopmod.attachments },
      orphaned: [],
      createdAt: "2026-04-22T00:00:00Z",
    };
    const price = (attachments: Record<string, string>) =>
      priceBuild(LL4, weaponItem, tree, attachments, byId, presets);
    const currentPrice = price(current.attachments);

    const result = optimize({
      weapon: adaptWeapon(weaponItem),
      weaponItem,
      presets,
      slotTree: tree,
      parts,
      objective: "min-recoil",
      constraints: { profile: LL4, pinnedSlots: new Map() },
    });
    if (!result.ok) throw new Error(`the solver found no build: ${result.reason}`);

    const change = (ticked: ReadonlySet<string>) => {
      const { build } = appliedSelection(current, result.build, ticked, tree, byId);
      return tickedWeaponChange({
        tree,
        parts: byId,
        gate: LL4,
        presets,
        weaponItem,
        current: current.attachments,
        currentPrice,
        ticked: build.attachments,
        tickedPrice: price(build.attachments),
      });
    };
    const all = new Set([
      ...appliedSelection(current, result.build, new Set(), tree, byId).rows.keys(),
    ]);

    // Every change ticked: the proposal buys the weapon another way than the SOPMOD II.
    expect(change(all)).toMatchObject({ from: sopmod.shortName });
    // Nothing ticked: the build is the SOPMOD II as it was, bought as it was.
    expect(change(new Set())).toBeNull();
  });
});
