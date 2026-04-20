import {
  simulateScenario,
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
    case "move": {
      const { from, to } = action;
      const len = state.plan.length;
      if (from === to) return state;
      if (from < 0 || from >= len || to < 0 || to >= len) return state;
      const plan = [...state.plan];
      const [item] = plan.splice(from, 1);
      plan.splice(to, 0, item!);
      return { ...state, plan };
    }
    case "remove": {
      const { index } = action;
      if (index < 0 || index >= state.plan.length) return state;
      return { ...state, plan: state.plan.filter((_, i) => i !== index) };
    }
    case "clear": {
      return initialScenarioState;
    }
    case "run": {
      const lastResult = simulateScenario(action.ammo, action.target, state.plan);
      return { ...state, lastResult };
    }
  }
}
