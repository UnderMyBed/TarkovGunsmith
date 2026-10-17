/**
 * The optimizer Web Worker: runs one `optimize()` off the main thread, so the page stays
 * responsive while it solves, and the run can be cancelled by terminating the worker.
 *
 * The main thread posts the whole input it already holds — the parsed snapshot's parts and
 * slot graph, priced — so the worker fetches and parses nothing. All the logic is
 * `answerOptimizeRequest` in `optimize-protocol.ts`, tested there; this file is the thread
 * boundary only. `useOptimizer` starts one worker per run and terminates it on the reply.
 */
import {
  answerOptimizeRequest,
  UNREADABLE_REQUEST,
  type OptimizeReply,
  type OptimizeRequest,
} from "./optimize-protocol.js";

/** The worker global, as far as this file uses it. The app's `lib` is DOM, not WebWorker. */
interface OptimizerWorkerScope {
  onmessage: ((event: MessageEvent<OptimizeRequest>) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(reply: OptimizeReply): void;
}

const scope = self as unknown as OptimizerWorkerScope;

scope.onmessage = (event) => {
  answerOptimizeRequest(event.data, (reply) => scope.postMessage(reply));
};

// A request that cannot be deserialised never reaches onmessage: answer it, or the page waits.
scope.onmessageerror = () => scope.postMessage(UNREADABLE_REQUEST);
