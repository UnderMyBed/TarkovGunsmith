import { optimize, type OptimizationInput, type OptimizationResult } from "@tarkov/optimizer";

/**
 * The wall-clock limit the Builder gives the solver, in milliseconds. Sent with every run so
 * the running panel's "of 2 s" and the solver's own deadline are the same number.
 */
export const OPTIMIZER_TIMEOUT_MS = 2000;

/** How often, at most, the worker reports progress while it solves. */
export const PROGRESS_INTERVAL_MS = 100;

/**
 * What the main thread posts to the optimizer worker: the input `optimize()` takes, without
 * `onProgress` — a function cannot cross the thread boundary; the worker supplies its own.
 */
export type OptimizeRequest = Omit<OptimizationInput, "onProgress">;

/** What the optimizer worker posts back: progress while it solves, then one result or error. */
export type OptimizeReply =
  | {
      readonly type: "progress";
      readonly nodes: number;
      /** Time since the worker started solving, by its own clock. */
      readonly elapsedMs: number;
    }
  | { readonly type: "result"; readonly result: OptimizationResult }
  | { readonly type: "error"; readonly message: string };

/**
 * Run one optimization and post what happens: a progress reply as the solve starts, then at
 * most every {@link PROGRESS_INTERVAL_MS}, then exactly one `result`, or one `error` when
 * `optimize` throws (a slot graph with a cycle, a broken record) — the message is the thrown
 * one. Elapsed time is the worker's, from the moment it starts solving, so it measures the same
 * span as the solver's own time limit.
 */
export function answerOptimizeRequest(
  request: OptimizeRequest,
  post: (reply: OptimizeReply) => void,
  now: () => number = Date.now,
): void {
  const startedAt = now();
  let lastPost = startedAt;
  post({ type: "progress", nodes: 0, elapsedMs: 0 });
  try {
    const result = optimize({
      ...request,
      onProgress: ({ nodes }) => {
        const at = now();
        if (at - lastPost < PROGRESS_INTERVAL_MS) return;
        lastPost = at;
        post({ type: "progress", nodes, elapsedMs: at - startedAt });
      },
    });
    post({ type: "result", result });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

/** The reply to a request the worker could not read. */
export const UNREADABLE_REQUEST: OptimizeReply = {
  type: "error",
  message: "The optimizer could not read this build.",
};
