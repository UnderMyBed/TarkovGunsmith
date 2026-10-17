import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, type PlayerProfile } from "./build-schema.js";
import { itemAvailability, type ItemAvailability } from "./item-availability.js";
import type { WeaponPreset } from "./queries/presets.js";
import { fixtureSnapshot } from "./__test-utils__/fixture-snapshot.js";
import { snapshotWeaponList, snapshotWeaponPresets } from "./snapshot/views.js";
import { presetAvailability, seedAttachments, seedPreset } from "./preset-seed.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const TT_GOLDEN = "5b3b713c5acfc4330140bd8d";
const M4A1_CARBINE = "5af08cf886f774223c269184";
const M4A1_SOPMOD = "5a8ae73886f7747b2e6e1416";
const PM_DEFAULT = "58414967245977598f1ad391";
const TT_GOLDEN_DEFAULT = "5b44abe986f774283e2e3512";

const withTraders = (traders: Partial<PlayerProfile["traders"]>): PlayerProfile => ({
  ...DEFAULT_PROFILE,
  traders: { ...DEFAULT_PROFILE.traders, ...traders },
});
const WITH_FLEA: PlayerProfile = { ...DEFAULT_PROFILE, flea: true, level: 20 };

async function load() {
  const { snapshot, prices } = await fixtureSnapshot();
  const byWeapon = snapshotWeaponPresets(snapshot, prices.prices);
  const weapons = snapshotWeaponList(snapshot, prices.prices);
  const presetsOf = (weaponId: string): readonly WeaponPreset[] => {
    const list = byWeapon[weaponId];
    if (list === undefined) throw new Error(`fixture lost ${weaponId}'s presets`);
    return list;
  };
  const presetById = new Map(Object.values(byWeapon).flatMap((list) => list.map((p) => [p.id, p])));
  const availability = (presetId: string, profile: PlayerProfile) => {
    const preset = presetById.get(presetId);
    if (preset === undefined) throw new Error(`fixture lost preset ${presetId}`);
    return presetAvailability(preset, profile);
  };
  const weapon = (id: string) => weapons.find((w) => w.id === id);
  return { presetsOf, availability, weapon, byWeapon };
}

describe("presetAvailability", () => {
  it("reads the preset's own trader offers and barters, tagged with the preset", async () => {
    const { availability } = await load();
    // Peacekeeper LL2 barters the Carbine; Mechanic LL2 barters the SOPMOD II.
    expect(availability(M4A1_CARBINE, withTraders({ peacekeeper: 2 }))).toMatchObject({
      available: true,
      kind: "barter",
      traderNormalizedName: "peacekeeper",
      preset: { id: M4A1_CARBINE, normalizedName: "colt-m4a1-556x45-assault-rifle-carbine" },
    });
    expect(availability(M4A1_SOPMOD, withTraders({ peacekeeper: 2 }))).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "mechanic",
      minLevel: 2,
      preset: { id: M4A1_SOPMOD },
    });
  });

  it("reads the preset's own flea listing, which the weapon's offers leave out", async () => {
    // Nothing sells the golden TT's default preset but the flea market.
    const { availability, weapon } = await load();
    expect(availability(TT_GOLDEN_DEFAULT, DEFAULT_PROFILE)).toEqual({
      available: false,
      reason: "flea-locked",
    });
    expect(availability(TT_GOLDEN_DEFAULT, WITH_FLEA)).toEqual({
      available: true,
      kind: "flea",
      priceRUB: 31109,
    });

    // Weapon-level availability is unchanged: it reads the receiver's own flea entry.
    const tt = weapon(TT_GOLDEN);
    if (tt === undefined) throw new Error("fixture lost the golden TT");
    expect(tt.buyFor.filter((entry) => entry.preset !== undefined)).toEqual([]);
    expect(itemAvailability(tt, WITH_FLEA)).toEqual({
      available: true,
      kind: "flea",
      priceRUB: 31109,
    });
  });

  it("reads a preset with no offers as having no sources", () => {
    expect(presetAvailability({ buyFor: [] }, WITH_FLEA)).toEqual({
      available: false,
      reason: "no-sources",
    });
  });
});

describe("seedPreset", () => {
  it("starts theorycraft from the default preset, ungated", async () => {
    const { presetsOf } = await load();
    const seed = seedPreset(presetsOf(M4A1), "theorycraft", () => {
      throw new Error("theorycraft reads no availability");
    });
    expect(seed?.preset.id).toBe(M4A1_CARBINE);
    expect(seed?.availability).toBeNull();
  });

  it("starts progression from the default preset when the profile can buy it", async () => {
    const { presetsOf, availability } = await load();
    const seed = seedPreset(presetsOf(PM), "progression", (id) =>
      availability(id, DEFAULT_PROFILE),
    );
    expect(seed?.preset.id).toBe(PM_DEFAULT);
    expect(seed?.availability).toMatchObject({ available: true, traderNormalizedName: "prapor" });
  });

  it("seeds a flea-only preset for a profile with flea access", async () => {
    const { presetsOf, availability } = await load();
    const seed = seedPreset(presetsOf(TT_GOLDEN), "progression", (id) =>
      availability(id, WITH_FLEA),
    );
    expect(seed?.preset.id).toBe(TT_GOLDEN_DEFAULT);
    expect(seed?.availability).toMatchObject({ available: true, kind: "flea" });
  });

  it("falls back to a preset the profile can buy when the default is locked", async () => {
    const { presetsOf, availability } = await load();
    const seed = seedPreset(presetsOf(M4A1), "progression", (id) =>
      availability(id, withTraders({ mechanic: 2 })),
    );
    expect(seed?.preset.id).toBe(M4A1_SOPMOD);
    expect(seed?.availability).toMatchObject({ available: true, traderNormalizedName: "mechanic" });
  });

  it("keeps the default, saying why, when the profile can buy none", async () => {
    const { presetsOf, availability } = await load();
    const seed = seedPreset(presetsOf(M4A1), "progression", (id) =>
      availability(id, DEFAULT_PROFILE),
    );
    expect(seed?.preset.id).toBe(M4A1_CARBINE);
    expect(seed?.availability).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "peacekeeper",
      minLevel: 2,
    });
  });

  it("falls back to the cheapest preset it can buy: known price, then name, then id", async () => {
    // No captured weapon has two obtainable non-default presets, so the order is checked over
    // captured presets with availabilities given directly.
    const { presetsOf } = await load();
    const [carbine, sopmod] = presetsOf(M4A1) as [WeaponPreset, WeaponPreset];
    const pm = { ...(presetsOf(PM)[0] as WeaponPreset), isDefault: false };
    const tt = { ...(presetsOf(TT_GOLDEN)[0] as WeaponPreset), isDefault: false };
    const ttTwin = { ...tt, id: `${tt.id}-twin` };
    const flea = (priceRUB: number | null): ItemAvailability => ({
      available: true,
      kind: "flea",
      priceRUB,
    });
    const locked: ItemAvailability = { available: false, reason: "flea-locked" };
    const seedWith = (prices: Record<string, ItemAvailability>) =>
      seedPreset([carbine, sopmod, pm, tt, ttTwin], "progression", (id) => prices[id] ?? locked)
        ?.preset.id;

    expect(seedWith({ [sopmod.id]: flea(90_000), [pm.id]: flea(12_000) })).toBe(pm.id);
    expect(seedWith({ [sopmod.id]: flea(null), [pm.id]: flea(12_000) })).toBe(pm.id);
    expect(seedWith({ [pm.id]: flea(12_000), [sopmod.id]: flea(null) })).toBe(pm.id);
    expect(seedWith({ [sopmod.id]: flea(1_000), [tt.id]: flea(null) })).toBe(sopmod.id);
    expect(seedWith({ [sopmod.id]: flea(null), [pm.id]: flea(null) })).toBe(sopmod.id);
    expect(seedWith({ [sopmod.id]: flea(5_000), [pm.id]: flea(5_000) })).toBe(sopmod.id);
    expect(seedWith({ [ttTwin.id]: flea(5_000), [tt.id]: flea(5_000) })).toBe(tt.id);
  });

  it("returns null for a weapon without presets", () => {
    expect(
      seedPreset([], "theorycraft", () => ({ available: false, reason: "no-sources" })),
    ).toBeNull();
  });

  it("throws when the list has no default, which selectWeaponPresets rules out", async () => {
    const { presetsOf } = await load();
    const others = presetsOf(M4A1).filter((p) => !p.isDefault);
    expect(() =>
      seedPreset(others, "theorycraft", () => ({ available: false, reason: "no-sources" })),
    ).toThrow(`no default preset among ${M4A1_SOPMOD}`);
  });
});

describe("seedAttachments", () => {
  it("returns the seeded preset's attachments, a copy, or none without presets", async () => {
    const { byWeapon } = await load();
    const m4 = byWeapon[M4A1] ?? [];
    const theorycraft = seedAttachments(m4, "theorycraft", DEFAULT_PROFILE);
    expect(theorycraft).toEqual(m4[0]?.attachments);
    expect(theorycraft).not.toBe(m4[0]?.attachments);
    expect(seedAttachments(m4, "progression", withTraders({ mechanic: 2 }))).toEqual(
      m4[1]?.attachments,
    );
    expect(seedAttachments([], "progression", DEFAULT_PROFILE)).toEqual({});
  });
});
