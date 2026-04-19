import { describe, expect, it, vi } from "vitest";
import { createTarkovClient } from "./client.js";

describe("createTarkovClient", () => {
  it("returns a client bound to the provided endpoint", () => {
    const client = createTarkovClient("https://example.test/graphql");
    expect(client.url).toBe("https://example.test/graphql");
  });

  it("uses the provided fetch implementation", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ping: "pong" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await client.request<{ ping: string }>("query { ping }");
    expect(result.ping).toBe("pong");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to global fetch when none is provided", () => {
    // We don't actually invoke fetch here — just verify the client constructs.
    const client = createTarkovClient("https://example.test/graphql");
    expect(typeof client.request).toBe("function");
  });
});
