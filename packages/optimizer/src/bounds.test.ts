import { describe, it, expect } from "vitest";
import { lowerBoundForRemaining } from "./bounds.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

describe("lowerBoundForRemaining", () => {
  it("min-weight: null (0 weight) is always the best candidate → 0 bound", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      new Map(),
      "min-weight",
      SMALL_WEAPON,
    );
    expect(bound).toBe(0);
  });

  it("max-ergonomics: negative sum of best-ergo candidate per slot", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      new Map(),
      "max-ergonomics",
      SMALL_WEAPON,
    );
    // Best ergo per slot: muzzle max(2, 3, 0) = 3; grip max(5, 0) = 5; stock max(8, 0) = 8 → 16.
    // Score is negated: -16.
    expect(bound).toBe(-16);
  });

  it("min-recoil: best possible recoil delta after all slots contribute their min recoilModifier", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      new Map(),
      "min-recoil",
      SMALL_WEAPON,
    );
    // Best per-slot recoilModifier: muzzle min(-12, -8, 0) = -12; grip min(-4, 0) = -4; stock min(-6, 0) = -6.
    // Sum = -22%. base = 100 + 200 = 300. bound = 300 * (-22 / 100) = -66.
    expect(bound).toBeCloseTo(-66, 5);
  });

  it("respects pinned slots (uses pinned item's value, not the best available)", () => {
    const pinBrake = new Map([["muzzle", "muzzle_brake"]]);
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      pinBrake,
      "max-ergonomics",
      SMALL_WEAPON,
    );
    // muzzle pinned to brake (ergo 2) + grip best (5) + stock best (8) = 15. Score delta = -15.
    expect(bound).toBe(-15);
  });

  it("returns 0 when there are no remaining slots", () => {
    expect(
      lowerBoundForRemaining([], SMALL_MODS, flea, new Map(), "min-weight", SMALL_WEAPON),
    ).toBe(0);
  });

  it("max-accuracy: best (smallest) accuracyModifier per slot summed", () => {
    // SMALL_MODS have accuracyModifier: 0 for all. Best is 0. Sum = 0.
    expect(
      lowerBoundForRemaining(
        SMALL_TREE.slots,
        SMALL_MODS,
        flea,
        new Map(),
        "max-accuracy",
        SMALL_WEAPON,
      ),
    ).toBe(0);
  });
});
