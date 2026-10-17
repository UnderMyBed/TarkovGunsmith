// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { OptimizationResult } from "@tarkov/optimizer";
import type { OptimizeReply, OptimizeRequest } from "./optimize-protocol.js";
import type { OptimizerWorker } from "./optimizer-worker.js";
import { useOptimizer } from "./useOptimizer.js";

afterEach(() => vi.restoreAllMocks());

/** A worker the test drives by hand: it records what it is sent and whether it was stopped. */
function fakeWorker(post: (request: OptimizeRequest) => void = () => {}) {
  const worker = {
    onmessage: null as ((event: MessageEvent<OptimizeReply>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn(post),
    reply(data: OptimizeReply) {
      worker.onmessage?.({ data } as MessageEvent<OptimizeReply>);
    },
  };
  return worker;
}

const pins = new Map([["muzzle", "brake"]]);
const request = {
  objective: "max-ergonomics",
  constraints: { pinnedSlots: pins },
} as unknown as OptimizeRequest;
const timeout: OptimizationResult = { ok: false, reason: "timeout" };

function setup(...workers: ReturnType<typeof fakeWorker>[]) {
  const queue = [...workers];
  const start = vi.fn(() => queue.shift()! as unknown as OptimizerWorker);
  const hook = renderHook(() => useOptimizer(start));
  return { ...hook, start };
}

describe("useOptimizer", () => {
  it("posts the request, reports progress, then the result with the objective it ran", () => {
    const worker = fakeWorker();
    const { result } = setup(worker);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    act(() => result.current.run(request));
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    expect(result.current.state).toBe("running");
    // No clock until the worker starts solving: its boot is not the solver's time.
    expect(result.current.progress).toEqual({ nodes: 0, startedAt: null });
    now.mockReturnValue(1_300);
    act(() => worker.reply({ type: "progress", nodes: 0, elapsedMs: 0 }));
    expect(result.current.progress).toEqual({ nodes: 0, startedAt: 1_300 });
    now.mockReturnValue(1_800);
    act(() => worker.reply({ type: "progress", nodes: 12, elapsedMs: 480 }));
    // The first report set the clock; later ones only count.
    expect(result.current.progress).toEqual({ nodes: 12, startedAt: 1_300 });
    act(() => worker.reply({ type: "result", result: timeout }));
    expect(result.current).toMatchObject({
      state: "done",
      result: timeout,
      objective: "max-ergonomics",
      progress: undefined,
    });
    // The pins the run was sent, kept with its result.
    expect(result.current.pins).toBe(pins);
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("reports what the solver threw", () => {
    const worker = fakeWorker();
    const { result } = setup(worker);
    act(() => result.current.run(request));
    act(() => worker.reply({ type: "error", message: "boom" }));
    expect(result.current.state).toBe("error");
    expect(result.current.error?.message).toBe("boom");
  });

  it("reports a worker that crashes, or whose reply cannot be read", () => {
    const crashing = fakeWorker();
    const garbled = fakeWorker();
    const { result } = setup(crashing, garbled, fakeWorker());
    act(() => result.current.run(request));
    const preventDefault = vi.fn();
    act(() => crashing.onerror?.({ message: "", preventDefault } as unknown as ErrorEvent));
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.error?.message).toBe("The optimizer failed: it did not start");
    expect(crashing.terminate).toHaveBeenCalled();
    act(() => result.current.run(request));
    act(() => garbled.onmessageerror?.({} as MessageEvent));
    expect(result.current.error?.message).toBe("The optimizer's reply could not be read");
    act(() => result.current.run(request));
    // Late errors from a worker already replaced are ignored.
    act(() =>
      crashing.onerror?.({ message: "late", preventDefault: vi.fn() } as unknown as ErrorEvent),
    );
    act(() => garbled.onmessageerror?.({} as MessageEvent));
    expect(result.current.state).toBe("running");
  });

  it("reports a worker that cannot start, or cannot be sent the build", () => {
    const { result } = renderHook(() =>
      useOptimizer(() => {
        throw new Error("blocked by policy");
      }),
    );
    act(() => result.current.run(request));
    expect(result.current.error?.message).toBe("The optimizer could not start: blocked by policy");

    const refusing = fakeWorker(() => {
      throw new DOMException("could not be cloned", "DataCloneError");
    });
    const second = setup(refusing);
    act(() => second.result.current.run(request));
    expect(second.result.current.error?.message).toBe(
      "The optimizer could not be sent this build: could not be cloned",
    );
    expect(refusing.terminate).toHaveBeenCalled();
    const stringThrown = setup(
      fakeWorker(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a non-Error throw is the case under test
        throw "nope";
      }),
    );
    act(() => stringThrown.result.current.run(request));
    expect(stringThrown.result.current.error?.message).toBe(
      "The optimizer could not be sent this build: nope",
    );
  });

  it("supersedes a run with a new one, ignoring the old worker's replies", () => {
    const first = fakeWorker();
    const second = fakeWorker();
    const { result } = setup(first, second);
    act(() => result.current.run(request));
    act(() => result.current.run({ ...request, objective: "min-weight" }));
    expect(first.terminate).toHaveBeenCalled();
    act(() => first.reply({ type: "result", result: timeout }));
    act(() => first.reply({ type: "progress", nodes: 5, elapsedMs: 10 }));
    expect(result.current.state).toBe("running");
    expect(result.current.progress?.nodes).toBe(0);
    act(() => second.reply({ type: "result", result: timeout }));
    expect(result.current.objective).toBe("min-weight");
  });

  it("cancels a run back to idle, and leaves a finished result alone", () => {
    const worker = fakeWorker();
    const { result } = setup(worker, fakeWorker());
    act(() => result.current.run(request));
    act(() => result.current.cancel());
    expect(worker.terminate).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    act(() => worker.reply({ type: "result", result: timeout }));
    expect(result.current.state).toBe("idle");

    const next = fakeWorker();
    const done = setup(next);
    act(() => done.result.current.run(request));
    act(() => next.reply({ type: "result", result: timeout }));
    act(() => done.result.current.cancel());
    expect(done.result.current.state).toBe("done");
    act(() => done.result.current.reset());
    expect(done.result.current).toMatchObject({ state: "idle", result: undefined });
  });

  it("terminates the worker when the component unmounts", () => {
    const worker = fakeWorker();
    const { result, unmount } = setup(worker);
    act(() => result.current.run(request));
    unmount();
    expect(worker.terminate).toHaveBeenCalled();
  });
});
