/** The part of a `Worker` `useOptimizer` uses; a real `Worker` is one. */
export type OptimizerWorker = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>;

/** Start a fresh optimizer worker (`optimize.worker.ts`). */
export function startOptimizerWorker(): OptimizerWorker {
  return new Worker(new URL("./optimize.worker.ts", import.meta.url), { type: "module" });
}
