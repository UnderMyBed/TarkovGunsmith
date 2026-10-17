import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, snapshotWeaponPresets, type PlayerProfile } from "@tarkov/data";
import { capturedBuilderData } from "../../../test/captured-data.js";
import { sideSeed } from "./compare-side.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";

describe("sideSeed", () => {
  it("seeds a side without a profile from the default preset, and one with a profile under it", async () => {
    const { snapshot, prices } = await capturedBuilderData();
    const presets = snapshotWeaponPresets(snapshot, prices.prices)[M4A1] ?? [];
    const carbine = presets.find((p) => p.isDefault)!;
    const sopmod = presets.find((p) => p.shortName === "M4A1 SOPMOD II")!;

    expect(sideSeed(presets, undefined)).toEqual(carbine.attachments);

    // In the captures the default (Carbine) is a Peacekeeper LL2 barter and the SOPMOD II a
    // Mechanic LL2 one: a side whose profile has only Mechanic at LL2 starts from the SOPMOD.
    const mechanicOnly: PlayerProfile = {
      ...DEFAULT_PROFILE,
      traders: { ...DEFAULT_PROFILE.traders, mechanic: 2 },
    };
    expect(sideSeed(presets, mechanicOnly)).toEqual(sopmod.attachments);
    expect(sopmod.attachments).not.toEqual(carbine.attachments);
  });
});
