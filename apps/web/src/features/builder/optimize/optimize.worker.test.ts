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
      postMessage: (reply: OptimizeReply) => void;
    } = { onmessage: null, postMessage: (reply) => posted.push(reply) };
    vi.stubGlobal("self", scope);
    await import("./optimize.worker.js");
    scope.onmessage?.({ data: { objective: "min-recoil" } as unknown as OptimizeRequest });
    expect(posted).toEqual([{ type: "result", result: { ok: false, reason: "timeout" } }]);
  });
});
