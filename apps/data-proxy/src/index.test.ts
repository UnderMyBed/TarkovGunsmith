import { describe, expect, it, vi, afterEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("/healthz", () => {
  it("returns 200 with body 'ok'", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/healthz"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("/graphql", () => {
  it("rejects non-POST requests with 405", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/graphql"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(405);
  });

  it("forwards a POST to the upstream and returns the response body", async () => {
    const upstream = vi.fn(
      () =>
        new Response(JSON.stringify({ data: { ping: "pong" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    globalThis.fetch = upstream as typeof fetch;

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ ping }", variables: {} }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ping: string } };
    expect(body.data.ping).toBe("pong");
    expect(upstream).toHaveBeenCalledTimes(1);
    const calledUrl = upstream.mock.calls[0]?.[0];
    expect(String(calledUrl)).toBe(env.UPSTREAM_GRAPHQL_URL);
  });

  it("falls through to 404 for unknown paths", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/anything-else"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});
