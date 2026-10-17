import type {
  AttachablePart,
  PriceGate,
  PricedPreset,
  WeaponListItem,
  WeaponTree,
} from "@tarkov/data";
import type { Objective, OptimizationInput } from "@tarkov/optimizer";
import type { BallisticWeapon } from "@tarkov/ballistics";

export interface ConstraintsState {
  objective: Objective;
  budgetRub: number | undefined;
  pinnedSlots: Map<string, string | null>;
}

export const initialConstraintsState: ConstraintsState = {
  objective: "min-recoil",
  budgetRub: undefined,
  pinnedSlots: new Map(),
};

export type ConstraintsAction =
  | { type: "SET_OBJECTIVE"; objective: Objective }
  | { type: "SET_BUDGET"; value: string }
  | { type: "TOGGLE_PIN"; slotPath: string; defaultItemId?: string }
  | { type: "INIT_FROM_BUILD"; attachments: Readonly<Record<string, string>> }
  | { type: "RESET" };

export function constraintsReducer(
  state: ConstraintsState,
  action: ConstraintsAction,
): ConstraintsState {
  switch (action.type) {
    case "SET_OBJECTIVE":
      return { ...state, objective: action.objective };
    case "SET_BUDGET": {
      const trimmed = action.value.trim();
      if (trimmed === "") return { ...state, budgetRub: undefined };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return state;
      return { ...state, budgetRub: parsed };
    }
    case "TOGGLE_PIN": {
      const next = new Map(state.pinnedSlots);
      if (next.has(action.slotPath)) {
        next.delete(action.slotPath);
      } else {
        next.set(action.slotPath, action.defaultItemId ?? null);
      }
      return { ...state, pinnedSlots: next };
    }
    case "INIT_FROM_BUILD": {
      const next = new Map<string, string | null>();
      for (const [slotPath, itemId] of Object.entries(action.attachments)) {
        next.set(slotPath, itemId);
      }
      return { ...state, pinnedSlots: next };
    }
    case "RESET":
      return initialConstraintsState;
  }
}

export interface OptimizerInputDeps {
  weapon: BallisticWeapon;
  /** The weapon's own record: its offers count toward the budget. */
  weaponItem: WeaponListItem;
  slotTree: WeaponTree;
  parts: readonly AttachablePart[];
  /** Whose gates the search and the budget read: the profile, or `null` in theorycraft. */
  gate: PriceGate;
  /** The weapon's presets, so the budget does not pay twice for parts a preset comes with. */
  presets: readonly PricedPreset[];
  /** Without live prices no build can be shown to fit a budget, so none is sent. */
  pricesReady: boolean;
}

/**
 * Combine the form state with the runtime deps to build the final
 * `OptimizationInput` passed to `optimize()`.
 */
export function toOptimizerInput(
  state: ConstraintsState,
  deps: OptimizerInputDeps,
): OptimizationInput {
  return {
    weapon: deps.weapon,
    weaponItem: deps.weaponItem,
    slotTree: deps.slotTree,
    parts: deps.parts,
    presets: deps.presets,
    objective: state.objective,
    constraints: {
      profile: deps.gate,
      pinnedSlots: state.pinnedSlots,
      ...(state.budgetRub !== undefined && deps.pricesReady ? { budgetRub: state.budgetRub } : {}),
    },
  };
}
