import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";

const validPairBody = JSON.stringify({
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
});

describe("POST /pairs", () => {
  it("stores a pair and returns { id, url }", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs", {
        method: "POST",
        body: validPairBody,
        headers: { "Content-Type": "application/json" },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    expect(body.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    expect(body.url).toContain(`/pairs/${body.id}`);
    const stored = await env.BUILDS.get(`p:${body.id}`);
    expect(stored).toBe(validPairBody);
  });

  it("rejects empty body", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs", { method: "POST", body: "" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects body > 32 KB", async () => {
    const ctx = createExecutionContext();
    const huge = "x".repeat(33 * 1024);
    const res = await worker.fetch(
      new Request("https://x/pairs", { method: "POST", body: huge }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(413);
  });

  it("rejects non-JSON body", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs", { method: "POST", body: "not json" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});

describe("GET /pairs/:id", () => {
  it("returns 200 with stored body", async () => {
    await env.BUILDS.put("p:abc23456", validPairBody);
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/pairs/abc23456"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(validPairBody);
  });

  it("returns 404 on missing id", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/pairs/nnxxxxxx"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed id", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/pairs/BAD-ID"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /pairs/:id/fork", () => {
  it("copies the stored pair under a new id", async () => {
    await env.BUILDS.put("p:srcmnpqr", validPairBody);
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs/srcmnpqr/fork", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    expect(body.id).not.toBe("srcmnpqr");
    expect(body.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    const stored = await env.BUILDS.get(`p:${body.id}`);
    expect(stored).toBe(validPairBody);
  });

  it("returns 404 when source doesn't exist", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs/ghstmnpq/fork", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed id", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs/BAD-ID/fork", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});
