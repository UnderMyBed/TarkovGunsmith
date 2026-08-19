import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";
import { PER_IP_DAILY_WRITE_LIMIT } from "./rate-limit.js";

const validPairBody = JSON.stringify({
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
});

// The shape builds-api accepted before schema validation existed — kept as a fixture to
// prove it is now rejected, not silently written to KV.
const legacyUnvalidatedPairPayload = JSON.stringify({ notAPair: true, left: "anything" });

async function postPair(body: string, ip?: string): Promise<Response> {
  const ctx = createExecutionContext();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ip) headers["CF-Connecting-IP"] = ip;
  const res = await worker.fetch(
    new Request("https://x/pairs", { method: "POST", body, headers }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function forkPair(id: string, ip?: string): Promise<Response> {
  const ctx = createExecutionContext();
  const headers: Record<string, string> = {};
  if (ip) headers["CF-Connecting-IP"] = ip;
  const res = await worker.fetch(
    new Request(`https://x/pairs/${id}/fork`, { method: "POST", headers }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe("POST /pairs", () => {
  it("stores a pair and returns { id, url }", async () => {
    const res = await postPair(validPairBody);
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; url: string }>();
    expect(body.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    expect(body.url).toContain(`/pairs/${body.id}`);
    const stored = await env.BUILDS.get(`p:${body.id}`);
    // Stored value is the *parsed and re-serialized* pair, not necessarily the exact
    // request bytes (see handlePostPair) — assert on parsed shape, not string equality.
    expect(JSON.parse(stored!)).toEqual(JSON.parse(validPairBody));
  });

  it("rejects empty body", async () => {
    const res = await postPair("");
    expect(res.status).toBe(400);
  });

  it("rejects body > 32 KB", async () => {
    const huge = "x".repeat(33 * 1024);
    const res = await postPair(huge);
    expect(res.status).toBe(413);
  });

  it("rejects non-JSON body", async () => {
    const res = await postPair("not json");
    expect(res.status).toBe(400);
  });

  it("rejects a schema-invalid payload with 400 and a useful message", async () => {
    const res = await postPair(legacyUnvalidatedPairPayload);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Invalid pair");
    // `v` is the discriminant `BuildPair` switches on; this payload has none.
    expect(body).toContain("v");
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
    const res = await forkPair("srcmnpqr");
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; url: string }>();
    expect(body.id).not.toBe("srcmnpqr");
    expect(body.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    const stored = await env.BUILDS.get(`p:${body.id}`);
    expect(stored).toBe(validPairBody);
  });

  it("returns 404 when source doesn't exist", async () => {
    const res = await forkPair("ghstmnpq");
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed id", async () => {
    const res = await forkPair("BAD-ID");
    expect(res.status).toBe(400);
  });
});

describe("POST /pairs and /pairs/:id/fork rate limiting", () => {
  // Distinct IPs per test — see the equivalent comment in index.test.ts's rate-limiting
  // describe block for why.

  it(`admits up to ${PER_IP_DAILY_WRITE_LIMIT} pair writes per IP per day, then 429s`, async () => {
    const ip = "203.0.113.30";
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT; i++) {
      const res = await postPair(validPairBody, ip);
      expect(res.status).toBe(201);
    }
    const blocked = await postPair(validPairBody, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });

  it("shares one budget across POST /pairs and POST /pairs/:id/fork for the same IP", async () => {
    const ip = "203.0.113.31";
    await env.BUILDS.put("p:frkbase2", validPairBody);

    // Split the cap across both write-performing endpoints.
    const half = Math.floor(PER_IP_DAILY_WRITE_LIMIT / 2);
    for (let i = 0; i < half; i++) {
      const res = await postPair(validPairBody, ip);
      expect(res.status).toBe(201);
    }
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT - half; i++) {
      const res = await forkPair("frkbase2", ip);
      expect(res.status).toBe(201);
    }
    // The combined total across both endpoints has now hit the single shared cap.
    const blocked = await postPair(validPairBody, ip);
    expect(blocked.status).toBe(429);
  });

  it("does not charge the daily budget for schema-invalid POST /pairs attempts", async () => {
    const ip = "203.0.113.32";
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT + 10; i++) {
      const res = await postPair(legacyUnvalidatedPairPayload, ip);
      expect(res.status).toBe(400);
    }
    const res = await postPair(validPairBody, ip);
    expect(res.status).toBe(201);
  });
});
