import { describe, expect, it } from "vitest";
import { fixtureClient } from "./__fixtures__/client.js";
import { DEFAULT_PROFILE, type PlayerProfile } from "./build-schema.js";
import type { ItemsDocument } from "./queries/documents.js";
import { buildSlotGraph } from "./queries/slot-graph.js";
import { selectWeaponPresets } from "./queries/presets.js";
import { fetchWeaponList } from "./queries/weaponList.js";
import { presetAvailability, seedPreset } from "./preset-seed.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const M4A1_CARBINE = "5af08cf886f774223c269184";
const M4A1_SOPMOD = "5a8ae73886f7747b2e6e1416";
const PM_DEFAULT = "58414967245977598f1ad391";

const withTraders = (traders: Partial<PlayerProfile["traders"]>): PlayerProfile => ({
  ...DEFAULT_PROFILE,
  traders: { ...DEFAULT_PROFILE.traders, ...traders },
});

async function load() {
  const client = fixtureClient();
  const [doc, weapons] = await Promise.all([
    client.fetchResource<ItemsDocument>("items"),
    fetchWeaponList(client),
  ]);
  const { byWeapon } = selectWeaponPresets(doc, buildSlotGraph(doc));
  const weapon = (id: string) => {
    const found = weapons.find((w) => w.id === id);
    if (found === undefined) throw new Error(`fixture lost weapon ${id}`);
    return found;
  };
  return { byWeapon, weapon };
}

describe("presetAvailability", () => {
  it("reads only the offers that sell that preset", async () => {
    const { weapon } = await load();
    // Peacekeeper LL2 barters the Carbine; Mechanic LL2 barters the SOPMOD II.
    expect(
      presetAvailability(weapon(M4A1), M4A1_CARBINE, withTraders({ peacekeeper: 2 })),
    ).toMatchObject({
      available: true,
      traderNormalizedName: "peacekeeper",
      preset: { id: M4A1_CARBINE },
    });
    expect(
      presetAvailability(weapon(M4A1), M4A1_SOPMOD, withTraders({ peacekeeper: 2 })),
    ).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "mechanic",
      minLevel: 2,
    });
  });

  it("reads no-sources for a preset nothing sells", async () => {
    const { weapon } = await load();
    expect(presetAvailability(weapon(PM), "no-such-preset", DEFAULT_PROFILE)).toEqual({
      available: false,
      reason: "no-sources",
    });
    expect(presetAvailability({ buyFor: null, types: [] }, PM_DEFAULT, DEFAULT_PROFILE)).toEqual({
      available: false,
      reason: "no-sources",
    });
  });
});

describe("seedPreset", () => {
  it("starts theorycraft from the default preset, ungated", async () => {
    const { byWeapon, weapon } = await load();
    const seed = seedPreset(byWeapon[M4A1] ?? [], weapon(M4A1), "theorycraft", DEFAULT_PROFILE);
    expect(seed?.preset.id).toBe(M4A1_CARBINE);
    expect(seed?.availability).toBeNull();
  });

  it("starts progression from the default preset when the profile can buy it", async () => {
    const { byWeapon, weapon } = await load();
    const seed = seedPreset(byWeapon[PM] ?? [], weapon(PM), "progression", DEFAULT_PROFILE);
    expect(seed?.preset.id).toBe(PM_DEFAULT);
    expect(seed?.availability).toMatchObject({ available: true, traderNormalizedName: "prapor" });
  });

  it("falls back to a preset the profile can buy when the default is locked", async () => {
    const { byWeapon, weapon } = await load();
    const seed = seedPreset(
      byWeapon[M4A1] ?? [],
      weapon(M4A1),
      "progression",
      withTraders({ mechanic: 2 }),
    );
    expect(seed?.preset.id).toBe(M4A1_SOPMOD);
    expect(seed?.availability).toMatchObject({ available: true, traderNormalizedName: "mechanic" });
  });

  it("keeps the default, saying why, when the profile can buy none", async () => {
    const { byWeapon, weapon } = await load();
    const seed = seedPreset(byWeapon[M4A1] ?? [], weapon(M4A1), "progression", DEFAULT_PROFILE);
    expect(seed?.preset.id).toBe(M4A1_CARBINE);
    expect(seed?.availability).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "peacekeeper",
      minLevel: 2,
    });
  });

  it("returns null for a weapon without presets", async () => {
    const { weapon } = await load();
    expect(seedPreset([], weapon(PM), "theorycraft", DEFAULT_PROFILE)).toBeNull();
  });

  it("throws when the list has no default, which selectWeaponPresets rules out", async () => {
    const { byWeapon, weapon } = await load();
    const others = (byWeapon[M4A1] ?? []).filter((p) => !p.isDefault);
    expect(() => seedPreset(others, weapon(M4A1), "theorycraft", DEFAULT_PROFILE)).toThrow(
      `no default preset among ${M4A1_SOPMOD}`,
    );
  });
});
