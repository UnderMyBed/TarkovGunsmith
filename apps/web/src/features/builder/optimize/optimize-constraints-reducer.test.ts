import { describe, it, expect } from "vitest";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
  type ConstraintsState,
} from "./optimize-constraints-reducer.js";
import type { PlayerProfile, WeaponListItem } from "@tarkov/data";

const profile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 1,
    therapist: 1,
    skier: 1,
    peacekeeper: 1,
    mechanic: 1,
    ragman: 1,
    jaeger: 1,
  },
  flea: true,
};

describe("constraintsReducer", () => {
  it("initial state has objective=min-recoil and no budget", () => {
    expect(initialConstraintsState.objective).toBe("min-recoil");
    expect(initialConstraintsState.budgetRub).toBeUndefined();
    expect(initialConstraintsState.pinnedSlots.size).toBe(0);
  });

  it("SET_OBJECTIVE updates the objective", () => {
    const next = constraintsReducer(initialConstraintsState, {
      type: "SET_OBJECTIVE",
      objective: "max-ergonomics",
    });
    expect(next.objective).toBe("max-ergonomics");
  });

  it("SET_BUDGET parses string input and handles blank as undefined", () => {
    const set = constraintsReducer(initialConstraintsState, {
      type: "SET_BUDGET",
      value: "50000",
    });
    expect(set.budgetRub).toBe(50000);
    const cleared = constraintsReducer(set, { type: "SET_BUDGET", value: "" });
    expect(cleared.budgetRub).toBeUndefined();
  });

  it("SET_BUDGET ignores negative or non-numeric input", () => {
    const neg = constraintsReducer(initialConstraintsState, { type: "SET_BUDGET", value: "-5" });
    expect(neg).toBe(initialConstraintsState);
    const nan = constraintsReducer(initialConstraintsState, { type: "SET_BUDGET", value: "abc" });
    expect(nan).toBe(initialConstraintsState);
  });

  it("SET_PIN locks a part, frees a slot, and never pins empty by freeing", () => {
    const locked = constraintsReducer(initialConstraintsState, {
      type: "SET_PIN",
      slotPath: "muzzle",
      pin: { itemId: "brake" },
    });
    expect([...locked.pinnedSlots]).toEqual([["muzzle", "brake"]]);
    const freed = constraintsReducer(locked, { type: "SET_PIN", slotPath: "muzzle", pin: "free" });
    expect(freed.pinnedSlots.size).toBe(0);
    // Freeing a free slot leaves it free, not pinned empty.
    const again = constraintsReducer(freed, { type: "SET_PIN", slotPath: "muzzle", pin: "free" });
    expect(again.pinnedSlots.has("muzzle")).toBe(false);
  });

  it("SET_PIN empty clears every pin below that slot, and only below it", () => {
    const state: ConstraintsState = {
      ...initialConstraintsState,
      pinnedSlots: new Map<string, string | null>([
        ["receiver", "upper"],
        ["receiver/barrel", "b"],
        ["receiver/barrel/muzzle", null],
        ["receiver_other", "x"],
        ["stock", "s"],
      ]),
    };
    const next = constraintsReducer(state, { type: "SET_PIN", slotPath: "receiver", pin: "empty" });
    expect([...next.pinnedSlots]).toEqual([
      ["receiver", null],
      ["receiver_other", "x"],
      ["stock", "s"],
    ]);
  });

  it("CLEAR_PINS frees every slot", () => {
    const state: ConstraintsState = {
      ...initialConstraintsState,
      pinnedSlots: new Map([["muzzle", "brake"]]),
    };
    expect(constraintsReducer(state, { type: "CLEAR_PINS" }).pinnedSlots.size).toBe(0);
  });

  it("UNPIN frees each slot for the solver, never pinning one to empty", () => {
    const state: ConstraintsState = {
      ...initialConstraintsState,
      pinnedSlots: new Map<string, string | null>([
        ["muzzle", "brake"],
        ["grip", null],
        ["stock", "buffer"],
      ]),
    };
    const next = constraintsReducer(state, {
      type: "UNPIN",
      slotPaths: ["muzzle", "grip", "nope"],
    });
    expect([...next.pinnedSlots]).toEqual([["stock", "buffer"]]);
    expect(state.pinnedSlots.size).toBe(3);
  });

  it("RESET returns to initial", () => {
    const state: ConstraintsState = {
      objective: "max-ergonomics",
      budgetRub: 5000,
      pinnedSlots: new Map([["muzzle", "brake"]]),
    };
    expect(constraintsReducer(state, { type: "RESET" })).toEqual(initialConstraintsState);
  });
});

describe("toOptimizerInput", () => {
  const weaponItem = {
    id: "w1",
    shortName: "W",
    types: [],
    buyFor: [],
  } as unknown as WeaponListItem;

  it("builds an OptimizationInput from ConstraintsState + deps", () => {
    const state: ConstraintsState = {
      objective: "min-recoil",
      budgetRub: 50000,
      pinnedSlots: new Map([["muzzle", "brake"]]),
    };
    const out = toOptimizerInput(state, {
      weapon: {
        id: "w1",
        name: "W",
        baseErgonomics: 0,
        baseVerticalRecoil: 0,
        baseHorizontalRecoil: 0,
        baseWeight: 0,
        centerOfImpact: 0,
        deviationCurve: 1,
        velocity: 0,
        fireRate: 0,
        effectiveDistance: 0,
        sightingRange: 0,
        defaultAmmo: null,
      },
      weaponItem,
      slotTree: { weaponId: "w1", weaponName: "W", slots: [] },
      parts: [],
      gate: profile,
      presets: [],
      pricesReady: true,
    });
    expect(out.objective).toBe("min-recoil");
    expect(out.constraints.budgetRub).toBe(50000);
    expect(out.constraints.pinnedSlots.get("muzzle")).toBe("brake");
    expect(out.constraints.profile).toBe(profile);
  });

  it("omits budgetRub when state's budgetRub is undefined", () => {
    const state: ConstraintsState = initialConstraintsState;
    const out = toOptimizerInput(state, {
      weapon: {
        id: "w1",
        name: "W",
        baseErgonomics: 0,
        baseVerticalRecoil: 0,
        baseHorizontalRecoil: 0,
        baseWeight: 0,
        centerOfImpact: 0,
        deviationCurve: 1,
        velocity: 0,
        fireRate: 0,
        effectiveDistance: 0,
        sightingRange: 0,
        defaultAmmo: null,
      },
      weaponItem,
      slotTree: { weaponId: "w1", weaponName: "W", slots: [] },
      parts: [],
      gate: profile,
      presets: [],
      pricesReady: true,
    });
    expect(out.constraints.budgetRub).toBeUndefined();
  });

  it("sends no budget until live prices have loaded, and gates on null in theorycraft", () => {
    const state: ConstraintsState = { ...initialConstraintsState, budgetRub: 50000 };
    const out = toOptimizerInput(state, {
      weapon: {
        id: "w1",
        name: "W",
        baseErgonomics: 0,
        baseVerticalRecoil: 0,
        baseHorizontalRecoil: 0,
        baseWeight: 0,
        baseAccuracy: 0,
      },
      weaponItem,
      slotTree: { weaponId: "w1", weaponName: "W", slots: [] },
      parts: [],
      gate: null,
      presets: [],
      pricesReady: false,
    });
    expect(out.constraints.budgetRub).toBeUndefined();
    expect(out.constraints.profile).toBeNull();
  });
});
