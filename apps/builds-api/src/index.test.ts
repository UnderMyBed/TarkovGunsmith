import { describe, expect, it } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";
import { PER_IP_DAILY_WRITE_LIMIT } from "./rate-limit.js";

// A real `BuildV6` shape — the schema now enforced at the write boundary. Every field here
// is required by `packages/tarkov-data/src/build-schema.ts`'s `BuildV6` (version, weaponId,
// attachments, orphaned, createdAt); `name`/`description` are optional and omitted.
const samplePayload = {
  version: 6,
  weaponId: "fixture-m4a1",
  attachments: { mod_pistol_grip: "fixture-grip" },
  orphaned: [] as string[],
  createdAt: "2026-04-21T00:00:00.000Z",
};

// The shape builds-api accepted before schema validation existed — kept as a fixture to
// prove it is now rejected, not silently written to KV.
const legacyUnvalidatedPayload = {
  schema_version: 1,
  weapon: { id: "fixture-m4a1", name: "M4A1" },
  mods: [{ id: "fixture-grip", name: "Grip" }],
  notes: "test build",
};

async function postBuild(payload: unknown, ip = "203.0.113.10"): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify(payload),
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function getBuild(id: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://x/builds/${id}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("/healthz", () => {
  it("returns 200 ok", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/healthz"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("POST /builds", () => {
  it("stores a build and returns the id + url", async () => {
    const res = await postBuild(samplePayload);
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; url: string }>();
    expect(body.id).toMatch(/^[a-z2-9]{8}$/);
    expect(body.url).toContain(`/builds/${body.id}`);
  });

  it("rejects non-JSON bodies with 400", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects empty bodies with 400", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects payloads larger than 32KB with 413", async () => {
    const huge = { ...samplePayload, notes: "x".repeat(40_000) };
    const res = await postBuild(huge);
    expect(res.status).toBe(413);
  });

  it("rejects non-POST methods with 405", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/builds"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(405);
  });

  it("rejects a schema-invalid payload with 400 and a useful message", async () => {
    const res = await postBuild(legacyUnvalidatedPayload);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Invalid build");
    // Names the actual problem field so the message is useful, not just "no". This legacy
    // payload has no `version` at all, which is the discriminant `Build` switches on, so
    // that's what Zod reports first.
    expect(body).toContain("version");
  });

  it("rejects a well-formed but unversioned build with 400", async () => {
    // `version` is the discriminant `Build` switches on — omitting it can't match any
    // member of the union, which is exactly the "any JSON" shape the old code accepted.
    const { version: _version, ...withoutVersion } = samplePayload;
    const res = await postBuild(withoutVersion);
    expect(res.status).toBe(400);
  });
});

describe("POST /builds rate limiting", () => {
  // Each test below gets its own IP. KV state in this pool is per-worker, not per-`it()`
  // block (unlike, say, a fresh-process test runner) — reusing an IP across tests would let
  // an earlier test's admitted writes bleed into a later one's count. Unique IPs sidestep
  // that regardless of the pool's exact isolation semantics, matching how the rest of this
  // file avoids cross-test collisions (fresh nanoid ids, distinct fixture ids per test).

  it(`admits up to ${PER_IP_DAILY_WRITE_LIMIT} writes per IP per day, then 429s`, async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT; i++) {
      const res = await postBuild(samplePayload, ip);
      expect(res.status).toBe(201);
    }
    const blocked = await postBuild(samplePayload, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });

  it("does not charge the daily budget for schema-invalid attempts", async () => {
    const ip = "203.0.113.21";
    // A flood of garbage well past the cap must never itself trip the limiter — only
    // requests that would otherwise have written to KV count against it.
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT + 10; i++) {
      const res = await postBuild(legacyUnvalidatedPayload, ip);
      expect(res.status).toBe(400);
    }
    // The IP's real budget is still fully intact.
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT; i++) {
      const res = await postBuild(samplePayload, ip);
      expect(res.status).toBe(201);
    }
    const blocked = await postBuild(samplePayload, ip);
    expect(blocked.status).toBe(429);
  });

  it("tracks each IP independently", async () => {
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT; i++) {
      const res = await postBuild(samplePayload, "203.0.113.22");
      expect(res.status).toBe(201);
    }
    // A second IP starts with a full, untouched budget.
    const res = await postBuild(samplePayload, "203.0.113.23");
    expect(res.status).toBe(201);
  });
});

describe("GET /builds/:id", () => {
  it("returns the stored build", async () => {
    const post = await postBuild(samplePayload);
    const { id } = await post.json<{ id: string }>();

    const get = await getBuild(id);
    expect(get.status).toBe(200);
    const body = await get.json<typeof samplePayload>();
    expect(body.weaponId).toBe(samplePayload.weaponId);
    expect(Object.keys(body.attachments)).toHaveLength(1);
  });

  it("returns 404 for unknown ids", async () => {
    const res = await getBuild("zzzzzzzz");
    expect(res.status).toBe(404);
  });

  it("returns 400 for ids that don't match the build-id pattern", async () => {
    const res = await getBuild("BAD-ID");
    expect(res.status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("falls through to 404", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/elsewhere"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});
