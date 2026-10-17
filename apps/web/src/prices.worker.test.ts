import { afterEach, describe, expect, it, vi } from "vitest";
import type { PriceReply, PriceRequest } from "@tarkov/data/prices";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("prices.worker", () => {
  it("answers each request with answerPriceRequest's reply", async () => {
    const posted: PriceReply[] = [];
    const scope: {
      onmessage: ((event: { data: PriceRequest }) => void) | null;
      postMessage: (reply: PriceReply) => void;
    } = { onmessage: null, postMessage: (reply) => posted.push(reply) };
    vi.stubGlobal("self", scope);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 503, statusText: "Down" }))),
    );
    await import("./prices.worker.js");
    scope.onmessage?.({
      data: { itemsUrl: "https://json.tarkov.dev/regular/items", ids: [], lastFetchedAt: null },
    });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ ok: false, message: "json.tarkov.dev answered 503 Down" });
  });
});
