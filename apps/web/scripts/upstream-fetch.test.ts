import { describe, expect, it, vi } from "vitest";
import { createRetryingFetch } from "./upstream-fetch.js";

const ok = () => new Response("{}", { status: 200 });
const status = (code: number) => new Response("", { status: code });

describe("createRetryingFetch", () => {
  it("passes a good answer, and a 4xx, straight through", async () => {
    const inner = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(status(404));
    const retrying = createRetryingFetch(inner as typeof fetch, { retryDelayMs: 0 });
    expect((await retrying("https://x/items")).status).toBe(200);
    expect((await retrying("https://x/items")).status).toBe(404);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx once, and returns the second answer whatever it is", async () => {
    const inner = vi
      .fn()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(status(502))
      .mockResolvedValueOnce(status(502));
    const retrying = createRetryingFetch(inner as typeof fetch, { retryDelayMs: 0 });
    expect((await retrying("https://x/items")).status).toBe(200);
    expect((await retrying("https://x/items")).status).toBe(502);
    expect(inner).toHaveBeenCalledTimes(4);
  });

  it("retries a network failure once, then fails with the second error", async () => {
    const inner = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new Error("still down"));
    const retrying = createRetryingFetch(inner as typeof fetch, { retryDelayMs: 0 });
    expect((await retrying("https://x/items")).status).toBe(200);
    await expect(retrying("https://x/items")).rejects.toThrow("still down");
  });

  it("cuts an attempt off after the timeout", async () => {
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason as Error)),
        ),
    );
    const retrying = createRetryingFetch(inner, { timeoutMs: 5, retryDelayMs: 0 });
    await expect(retrying("https://x/items")).rejects.toThrow(/timed? ?out|aborted/i);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
