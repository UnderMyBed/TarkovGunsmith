import { describe, it, expect } from "vitest";
import { branchAndBound, type BnbState } from "./branch-and-bound.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

function makeState(overrides: Partial<BnbState> = {}): BnbState {
  return {
    weapon: SMALL_WEAPON,
    modList: SMALL_MODS,
    profile: flea,
    pinnedSlots: new Map(),
    objective: "min-recoil",
    budgetRub: undefined,
    deadline: Number.POSITIVE_INFINITY,
    onNodeVisit: () => true,
    ...overrides,
  };
}

describe("branchAndBound", () => {
  it("finds min-recoil optimum on small weapon", () => {
    const best = branchAndBound(makeState(), SMALL_TREE.slots);
    expect(best).not.toBeNull();
    expect(best!.attachments).toEqual({
      muzzle: "muzzle_brake",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
  });

  it("respects pinned slots", () => {
    const pin = new Map([["muzzle", "muzzle_silencer"]]);
    const best = branchAndBound(makeState({ pinnedSlots: pin }), SMALL_TREE.slots);
    expect(best!.attachments.muzzle).toBe("muzzle_silencer");
  });

  it("respects budget", () => {
    // brake (1500) + vertical (900) + stock (2200) = 4600 fits 5000 budget.
    // silencer (3500) + vertical (900) + stock (2200) = 6600 exceeds.
    const best = branchAndBound(makeState({ budgetRub: 5000 }), SMALL_TREE.slots);
    expect(best!.attachments.muzzle).toBe("muzzle_brake");
  });

  it("returns a feasible best at budget 0 (empty build)", () => {
    const best = branchAndBound(makeState({ budgetRub: 0 }), SMALL_TREE.slots);
    expect(best).not.toBeNull();
    expect(Object.keys(best!.attachments)).toHaveLength(0);
  });

  it("aborts when onNodeVisit returns false (timeout simulation)", () => {
    const best = branchAndBound(makeState({ onNodeVisit: () => false }), SMALL_TREE.slots);
    // Aborted early; doesn't throw. Result may be null or a partial best.
    expect(best === null || typeof best.score === "number").toBe(true);
  });

  it("tie-breaks deterministically: min-weight on this fixture always picks empty build", () => {
    const best = branchAndBound(makeState({ objective: "min-weight" }), SMALL_TREE.slots);
    expect(best!.attachments).toEqual({});
    expect(best!.price).toBe(0);
  });

  it("is deterministic — same input, same output across 5 runs", () => {
    const state = makeState();
    const first = branchAndBound(state, SMALL_TREE.slots);
    for (let i = 0; i < 4; i++) {
      const r = branchAndBound(state, SMALL_TREE.slots);
      expect(r).toEqual(first);
    }
  });
});
