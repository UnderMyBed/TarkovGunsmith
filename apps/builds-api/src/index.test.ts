import { describe, expect, it } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";

const samplePayload = {
  schema_version: 1,
  weapon: { id: "fixture-m4a1", name: "M4A1" },
  mods: [{ id: "fixture-grip", name: "Grip" }],
  notes: "test build",
};

async function postBuild(payload: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const body = (await res.json()) as { id: string; url: string };
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
});

describe("GET /builds/:id", () => {
  it("returns the stored build", async () => {
    const post = await postBuild(samplePayload);
    const { id } = (await post.json()) as { id: string };

    const get = await getBuild(id);
    expect(get.status).toBe(200);
    const body = (await get.json()) as typeof samplePayload;
    expect(body.weapon.id).toBe(samplePayload.weapon.id);
    expect(body.mods).toHaveLength(1);
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
