import { useCallback, useState } from "react";
import { optimize, type OptimizationInput, type OptimizationResult } from "@tarkov/optimizer";

export type OptimizerState = "idle" | "running" | "done" | "error";

export interface UseOptimizerReturn {
  state: OptimizerState;
  result: OptimizationResult | undefined;
  error: Error | undefined;
  run(input: OptimizationInput): void;
  reset(): void;
}

/**
 * Thin wrapper around `optimize()`. The solver is synchronous; the
 * `"running"` state exists only to render a brief spinner around the
 * call. In practice most weapons solve in <50 ms.
 */
export function useOptimizer(): UseOptimizerReturn {
  const [state, setState] = useState<OptimizerState>("idle");
  const [result, setResult] = useState<OptimizationResult | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  const run = useCallback((input: OptimizationInput) => {
    setState("running");
    setResult(undefined);
    setError(undefined);
    // Defer to next microtask so React can paint the "running" state.
    queueMicrotask(() => {
      try {
        const r = optimize(input);
        setResult(r);
        setState("done");
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setState("error");
      }
    });
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setResult(undefined);
    setError(undefined);
  }, []);

  return { state, result, error, run, reset };
}
