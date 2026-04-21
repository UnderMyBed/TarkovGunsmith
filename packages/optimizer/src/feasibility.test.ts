import { describe, it, expect } from "vitest";
import { cheapestPrice, slotCandidates } from "./feasibility.js";
import { SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const fleaOnProfile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

const fleaOffProfile: PlayerProfile = { ...fleaOnProfile, flea: false };

describe("cheapestPrice", () => {
  it("returns the flea price when profile has flea on", () => {
    const brake = SMALL_MODS.find((m) => m.id === "muzzle_brake")!;
    expect(cheapestPrice(brake, fleaOnProfile)).toBe(1500);
  });

  it("returns null when profile has flea off and no trader source", () => {
    const brake = SMALL_MODS.find((m) => m.id === "muzzle_brake")!;
    expect(cheapestPrice(brake, fleaOffProfile)).toBeNull();
  });
});

describe("slotCandidates", () => {
  it("returns compatible available items + null for unpinned slots", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, new Map());
    const ids = candidates.map((c) => (c ? c.id : null));
    expect(ids).toContain("muzzle_brake");
    expect(ids).toContain("muzzle_silencer");
    expect(ids).toContain(null);
    expect(candidates).toHaveLength(3);
  });

  it("returns the pinned item only when slot is pinned", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "muzzle_brake"]]);
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, pin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("muzzle_brake");
  });

  it("returns [null] when slot is pinned empty", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map<string, string | null>([["muzzle", null]]);
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, pin);
    expect(candidates).toEqual([null]);
  });

  it("filters out unavailable items when unpinned", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOffProfile, new Map());
    expect(candidates).toEqual([null]);
  });

  it("keeps pinned items even when the pinned item is unavailable under profile", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "muzzle_brake"]]);
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOffProfile, pin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("muzzle_brake");
  });

  it("returns an empty array when the slot is pinned to an item not in modList", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "nonexistent_item"]]);
    expect(slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, pin)).toEqual([]);
  });
});
