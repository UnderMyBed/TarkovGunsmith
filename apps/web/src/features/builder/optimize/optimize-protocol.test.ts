import { afterEach, describe, expect, it, vi } from "vitest";
import type { OptimizationInput, OptimizationResult } from "@tarkov/optimizer";
import type { OptimizeReply, OptimizeRequest } from "./optimize-protocol.js";

const solver = vi.hoisted(() => ({
  run: (_input: unknown): unknown => ({ ok: false, reason: "timeout" }),
}));
vi.mock("@tarkov/optimizer", () => ({ optimize: (input: unknown) => solver.run(input) }));

const { answerOptimizeRequest, PROGRESS_INTERVAL_MS } = await import("./optimize-protocol.js");

afterEach(() => {
  solver.run = () => ({ ok: false, reason: "timeout" });
});

const request = { objective: "min-recoil", timeoutMs: 2000 } as unknown as OptimizeRequest;

describe("answerOptimizeRequest", () => {
  it("runs the request, reporting progress at most every interval, then the result", () => {
    const result: OptimizationResult = { ok: false, reason: "timeout" };
    let seen: OptimizationInput | undefined;
    solver.run = (input) => {
      seen = input as OptimizationInput;
      for (let nodes = 1; nodes <= 5; nodes++) seen.onProgress!({ nodes });
      return result;
    };
    // The solve starts at 1000 ms; nodes 1–5 are checked at +0, +40, +100, +150, +250.
    const clock = [1000, 1000, 1040, 1100, 1150, 1250];
    const posted: OptimizeReply[] = [];
    answerOptimizeRequest(
      request,
      (r) => posted.push(r),
      () => clock.shift()!,
    );
    expect(seen).toMatchObject({ objective: "min-recoil", timeoutMs: 2000 });
    expect(PROGRESS_INTERVAL_MS).toBe(100);
    expect(posted).toEqual([
      { type: "progress", nodes: 0, elapsedMs: 0 },
      { type: "progress", nodes: 3, elapsedMs: 100 },
      { type: "progress", nodes: 5, elapsedMs: 250 },
      { type: "result", result },
    ]);
  });

  it("answers with what optimize threw", () => {
    const posted: OptimizeReply[] = [];
    solver.run = () => {
      throw new Error("the slot graph has a cycle through loop");
    };
    answerOptimizeRequest(request, (r) => posted.push(r));
    solver.run = () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a non-Error throw is the case under test
      throw "plain";
    };
    answerOptimizeRequest(request, (r) => posted.push(r));
    expect(posted.filter((r) => r.type !== "progress")).toEqual([
      { type: "error", message: "the slot graph has a cycle through loop" },
      { type: "error", message: "plain" },
    ]);
  });
});
