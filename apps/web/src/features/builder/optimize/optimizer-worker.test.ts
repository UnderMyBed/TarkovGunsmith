import { afterEach, describe, expect, it, vi } from "vitest";
import { startOptimizerWorker } from "./optimizer-worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("startOptimizerWorker", () => {
  it("starts the optimizer worker module as a module worker", () => {
    const made: { url: string; options: WorkerOptions | undefined }[] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: URL, options?: WorkerOptions) {
          made.push({ url: String(url), options });
        }
      },
    );
    startOptimizerWorker();
    expect(made).toHaveLength(1);
    expect(made[0]!.url).toMatch(/\/optimize\.worker\.ts$/);
    expect(made[0]!.options).toEqual({ type: "module" });
  });
});
