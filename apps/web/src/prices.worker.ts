/**
 * The price Web Worker: fetches upstream's 17 MB `items` document, reads the prices the
 * snapshot needs, and posts back only those — a few hundred KB — so the parse never runs on
 * the main thread. `createBuilderDataSource` starts one per price load and terminates it on
 * the reply, which frees the parsed document at once.
 *
 * All the logic is `answerPriceRequest` in `@tarkov/data/prices`, tested there; this file is
 * the thread boundary only. It imports the zod-free subpath so the worker chunk stays small.
 */
import { answerPriceRequest, type PriceReply, type PriceRequest } from "@tarkov/data/prices";

/** The worker global, as far as this file uses it. The app's `lib` is DOM, not WebWorker. */
interface PriceWorkerScope {
  onmessage: ((event: MessageEvent<PriceRequest>) => void) | null;
  postMessage(reply: PriceReply): void;
}

const scope = self as unknown as PriceWorkerScope;

scope.onmessage = (event) => {
  void answerPriceRequest(event.data).then((reply) => scope.postMessage(reply));
};
