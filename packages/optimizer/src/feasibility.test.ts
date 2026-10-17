import { describe, it, expect } from "vitest";
import { slotCandidates } from "./feasibility.js";
import { SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import { partsById, type PlayerProfile } from "@tarkov/data";

const PARTS = partsById(SMALL_MODS);

const fleaOnProfile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
  // SMALL_MODS' flea offers all carry minPlayerLevel: 15. That number was inert until
  // itemAvailability started enforcing it; 15 keeps these tests testing what they were
  // written to test rather than accidentally testing the level gate.
  level: 15,
};

const fleaOffProfile: PlayerProfile = { ...fleaOnProfile, flea: false };

/** Same flea access, but below every fixture offer's minPlayerLevel. */
const underLevelledProfile: PlayerProfile = { ...fleaOnProfile, level: 14 };

describe("slotCandidates", () => {
  it("returns compatible available items + null for unpinned slots", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, PARTS, fleaOnProfile, new Map());
    const ids = candidates.map((c) => (c ? c.id : null));
    expect(ids).toContain("muzzle_brake");
    expect(ids).toContain("muzzle_silencer");
    expect(ids).toContain(null);
    expect(candidates).toHaveLength(3);
  });

  it("skips an allowed id the part catalog does not hold", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const withoutBrake = partsById(SMALL_MODS.filter((m) => m.id !== "muzzle_brake"));
    const ids = slotCandidates(muzzleSlot, withoutBrake, fleaOnProfile, new Map()).map((c) =>
      c ? c.id : null,
    );
    expect(ids).toEqual(["muzzle_silencer", null]);
  });

  it("returns the pinned item only when slot is pinned", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "muzzle_brake"]]);
    const candidates = slotCandidates(muzzleSlot, PARTS, fleaOnProfile, pin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("muzzle_brake");
  });

  it("returns [null] when slot is pinned empty", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map<string, string | null>([["muzzle", null]]);
    const candidates = slotCandidates(muzzleSlot, PARTS, fleaOnProfile, pin);
    expect(candidates).toEqual([null]);
  });

  it("filters out unavailable items when unpinned", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, PARTS, fleaOffProfile, new Map());
    expect(candidates).toEqual([null]);
  });

  // The solver must not propose a build the player can't actually buy. A flea-only mod
  // above their level has to leave the search space entirely, not merely score badly.
  it("drops flea-only mods the profile is too low-level to buy", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, PARTS, underLevelledProfile, new Map());
    expect(candidates).toEqual([null]);
  });

  it("keeps pinned items even when the pinned item is unavailable under profile", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "muzzle_brake"]]);
    const candidates = slotCandidates(muzzleSlot, PARTS, fleaOffProfile, pin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("muzzle_brake");
  });

  it("returns an empty array when the slot is pinned to an item not in the catalog", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "nonexistent_item"]]);
    expect(slotCandidates(muzzleSlot, PARTS, fleaOnProfile, pin)).toEqual([]);
  });
});
