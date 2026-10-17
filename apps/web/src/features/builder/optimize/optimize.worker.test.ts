import { afterEach, describe, expect, it, vi } from "vitest";
import type { OptimizeReply, OptimizeRequest } from "./optimize-protocol.js";

vi.mock("@tarkov/optimizer", () => ({ optimize: () => ({ ok: false, reason: "timeout" }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("optimize.worker", () => {
  it("answers each request with answerOptimizeRequest's replies", async () => {
    const posted: OptimizeReply[] = [];
    const scope: {
      onmessage: ((event: { data: OptimizeRequest }) => void) | null;
      onmessageerror: (() => void) | null;
      postMessage: (reply: OptimizeReply) => void;
    } = { onmessage: null, onmessageerror: null, postMessage: (reply) => posted.push(reply) };
    vi.stubGlobal("self", scope);
    await import("./optimize.worker.js");
    scope.onmessage?.({ data: { objective: "min-recoil" } as unknown as OptimizeRequest });
    expect(posted).toEqual([
      { type: "progress", nodes: 0, elapsedMs: 0 },
      { type: "result", result: { ok: false, reason: "timeout" } },
    ]);
    // A request it cannot read is answered too, or the page would wait on it for ever.
    scope.onmessageerror?.();
    expect(posted[2]).toEqual({
      type: "error",
      message: "The optimizer could not read this build.",
    });
  });
});
