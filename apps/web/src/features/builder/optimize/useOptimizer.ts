import { useCallback, useEffect, useRef, useState } from "react";
import type { Objective, OptimizationResult } from "@tarkov/optimizer";
import type { OptimizeReply, OptimizeRequest } from "./optimize-protocol.js";
import { startOptimizerWorker, type OptimizerWorker } from "./optimizer-worker.js";

export type OptimizerState = "idle" | "running" | "done" | "error";

export interface OptimizerProgress {
  /** Candidate builds the solver has checked so far. */
  readonly nodes: number;
  /** When the run started (`Date.now()`), for the elapsed time the running panel shows. */
  readonly startedAt: number;
}

export interface UseOptimizerReturn {
  state: OptimizerState;
  result: OptimizationResult | undefined;
  /** The objective the current run or result was run with: the form may have moved on. */
  objective: Objective | undefined;
  /** While running: how far the run has got. */
  progress: OptimizerProgress | undefined;
  error: Error | undefined;
  /** Start a run. A run already going is terminated and its replies are ignored. */
  run(input: OptimizeRequest): void;
  /** Terminate the run going, if any, and go back to idle. */
  cancel(): void;
  /** Terminate any run and clear any result. */
  reset(): void;
}

interface Snapshot {
  readonly state: OptimizerState;
  readonly result?: OptimizationResult;
  readonly objective?: Objective;
  readonly progress?: OptimizerProgress;
  readonly error?: Error;
}

const IDLE: Snapshot = { state: "idle" };

/**
 * Runs `optimize()` in a Web Worker, one worker per run. The page stays responsive while the
 * solver works, Cancel terminates the worker outright, and a new run supersedes the old one.
 *
 * A worker that fails to start, crashes, or whose reply cannot be read puts the hook in
 * `"error"` with the reason: there is no fallback to the main thread, so a broken worker
 * bundle shows rather than hiding behind a frozen page.
 */
export function useOptimizer(
  start: () => OptimizerWorker = startOptimizerWorker,
): UseOptimizerReturn {
  const [snapshot, setSnapshot] = useState<Snapshot>(IDLE);
  const current = useRef<OptimizerWorker | null>(null);

  const stop = useCallback(() => {
    current.current?.terminate();
    current.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const run = useCallback(
    (input: OptimizeRequest) => {
      stop();
      const objective = input.objective;
      const fail = (error: Error) => {
        stop();
        setSnapshot({ state: "error", objective, error });
      };
      let worker: OptimizerWorker;
      try {
        worker = start();
      } catch (e) {
        fail(new Error(`The optimizer could not start: ${messageOf(e)}`));
        return;
      }
      current.current = worker;
      const startedAt = Date.now();
      setSnapshot({ state: "running", objective, progress: { nodes: 0, startedAt } });
      // A superseded or cancelled worker is terminated, but a reply it posted first may
      // still be queued: only the current worker's replies count.
      const mine = () => current.current === worker;
      worker.onmessage = (event: MessageEvent<OptimizeReply>) => {
        if (!mine()) return;
        const reply = event.data;
        if (reply.type === "progress") {
          setSnapshot({ state: "running", objective, progress: { nodes: reply.nodes, startedAt } });
          return;
        }
        stop();
        setSnapshot(
          reply.type === "result"
            ? { state: "done", objective, result: reply.result }
            : { state: "error", objective, error: new Error(reply.message) },
        );
      };
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault();
        if (mine()) fail(new Error(`The optimizer failed: ${event.message || "it did not start"}`));
      };
      worker.onmessageerror = () => {
        if (mine()) fail(new Error("The optimizer's reply could not be read"));
      };
      try {
        worker.postMessage(input);
      } catch (e) {
        fail(new Error(`The optimizer could not be sent this build: ${messageOf(e)}`));
      }
    },
    [start, stop],
  );

  const cancel = useCallback(() => {
    stop();
    setSnapshot((s) => (s.state === "running" ? IDLE : s));
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setSnapshot(IDLE);
  }, [stop]);

  return {
    state: snapshot.state,
    result: snapshot.result,
    objective: snapshot.objective,
    progress: snapshot.state === "running" ? snapshot.progress : undefined,
    error: snapshot.error,
    run,
    cancel,
    reset,
  };
}

function messageOf(error: unknown): string {
  // A DataCloneError is a DOMException, which not every engine makes an Error.
  return error instanceof Error || error instanceof DOMException ? error.message : String(error);
}
