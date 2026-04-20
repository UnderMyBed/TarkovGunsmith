import { useCallback, useReducer } from "react";
import type {
  BallisticAmmo,
  PlannedShot,
  ScenarioResult,
  ScenarioTarget,
} from "@tarkov/ballistics";
import { type ScenarioState, initialScenarioState, scenarioReducer } from "./scenarioReducer.js";

/**
 * React hook managing the Ballistics Simulator's scenario state. Wraps the
 * pure `scenarioReducer` and exposes stable action dispatchers.
 *
 * All state mutation flows through the reducer — callers never set plan or
 * lastResult directly, which keeps the Simulator's invariants (length cap,
 * index clamping, reset-on-clear) enforced in one place.
 */
export interface UseScenarioReturn {
  readonly plan: ScenarioState["plan"];
  readonly lastResult: ScenarioResult | null;
  readonly append: (shot: PlannedShot) => void;
  readonly move: (from: number, to: number) => void;
  readonly remove: (index: number) => void;
  readonly clear: () => void;
  readonly run: (ammo: BallisticAmmo, target: ScenarioTarget) => void;
}

export function useScenario(): UseScenarioReturn {
  const [state, dispatch] = useReducer(scenarioReducer, initialScenarioState);

  const append = useCallback((shot: PlannedShot) => dispatch({ type: "append", shot }), []);
  const move = useCallback((from: number, to: number) => dispatch({ type: "move", from, to }), []);
  const remove = useCallback((index: number) => dispatch({ type: "remove", index }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const run = useCallback(
    (ammo: BallisticAmmo, target: ScenarioTarget) => dispatch({ type: "run", ammo, target }),
    [],
  );

  return {
    plan: state.plan,
    lastResult: state.lastResult,
    append,
    move,
    remove,
    clear,
    run,
  };
}
