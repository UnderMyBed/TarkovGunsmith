import {
  type BallisticAmmo,
  type PlannedShot,
  type ScenarioResult,
  type ScenarioTarget,
} from "@tarkov/ballistics";

export const PLAN_LENGTH_CAP = 128;

export interface ScenarioState {
  readonly plan: readonly PlannedShot[];
  readonly lastResult: ScenarioResult | null;
}

export const initialScenarioState: ScenarioState = {
  plan: [],
  lastResult: null,
};

export type ScenarioAction =
  | { type: "append"; shot: PlannedShot }
  | { type: "move"; from: number; to: number }
  | { type: "remove"; index: number }
  | { type: "clear" }
  | { type: "run"; ammo: BallisticAmmo; target: ScenarioTarget };

export function scenarioReducer(state: ScenarioState, action: ScenarioAction): ScenarioState {
  switch (action.type) {
    case "append": {
      if (state.plan.length >= PLAN_LENGTH_CAP) return state;
      return { ...state, plan: [...state.plan, action.shot] };
    }
    case "move":
    case "remove":
    case "clear":
    case "run": {
      // Implemented in later tasks.
      return state;
    }
  }
}
