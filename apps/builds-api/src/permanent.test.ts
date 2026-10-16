import { describe, expect, it, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";

const validBuild = JSON.stringify({
  version: 6,
  weaponId: "fixture-m4a1",
  attachments: { mod_pistol_grip: "fixture-grip" },
  orphaned: [],
  createdAt: "2026-04-21T00:00:00.000Z",
});

const validPair = JSON.stringify({
  v: 1,
  createdAt: "2026-04-21T00:00:00.000Z",
  left: null,
  right: null,
});

async function entry(key: string) {
  const { keys } = await env.BUILDS.list({ prefix: key });
  return keys.find((k) => k.name === key);
}

async function fetchWith(bindings: Env, req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function post(path: string, body: string, ip: string): Request {
  return new Request(`https://x${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body,
  });
}

describe("shared builds and pairs never expire", () => {
  it("POST /builds writes the b: key with no expiry and the permanent stamp", async () => {
    const res = await fetchWith(env, post("/builds", validBuild, "198.51.100.1"));
    const { id } = await res.json<{ id: string }>();
    const e = await entry(`b:${id}`);
    expect(e).toBeDefined();
    expect(e?.expiration).toBeUndefined();
    expect(e?.metadata).toEqual({ permanent: true });
  });

  it("POST /pairs writes the p: key with no expiry and the permanent stamp", async () => {
    const res = await fetchWith(env, post("/pairs", validPair, "198.51.100.2"));
    const { id } = await res.json<{ id: string }>();
    const e = await entry(`p:${id}`);
    expect(e).toBeDefined();
    expect(e?.expiration).toBeUndefined();
    expect(e?.metadata).toEqual({ permanent: true });
  });

  it("POST /pairs/:id/fork writes the copy with no expiry", async () => {
    await env.BUILDS.put("p:srcprm22", validPair, { metadata: { permanent: true } });
    const res = await fetchWith(env, post("/pairs/srcprm22/fork", "", "198.51.100.3"));
    const { id } = await res.json<{ id: string }>();
    const e = await entry(`p:${id}`);
    expect(e?.expiration).toBeUndefined();
    expect(e?.metadata).toEqual({ permanent: true });
  });

  it("rate-limit counters still expire", async () => {
    await fetchWith(env, post("/builds", validBuild, "198.51.100.4"));
    const { keys } = await env.BUILDS.list();
    const counters = keys.filter((k) => !k.name.startsWith("b:") && !k.name.startsWith("p:"));
    expect(counters.length).toBeGreaterThan(0);
    for (const c of counters) expect(c.expiration).toBeTypeOf("number");
  });
});

describe("lazy upgrade of legacy keys", () => {
  it("re-puts a legacy build without its TTL, stamped, on read", async () => {
    await env.BUILDS.put("b:gcybd222", validBuild, { expirationTtl: 3600 });
    expect((await entry("b:gcybd222"))?.expiration).toBeTypeOf("number");

    const res = await fetchWith(env, new Request("https://x/builds/gcybd222"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(validBuild);

    const e = await entry("b:gcybd222");
    expect(e?.expiration).toBeUndefined();
    expect(e?.metadata).toEqual({ permanent: true });
  });

  it("re-puts a legacy pair without its TTL, stamped, on read", async () => {
    await env.BUILDS.put("p:gcypr222", validPair, { expirationTtl: 3600 });
    const res = await fetchWith(env, new Request("https://x/pairs/gcypr222"));
    expect(res.status).toBe(200);
    const e = await entry("p:gcypr222");
    expect(e?.expiration).toBeUndefined();
    expect(e?.metadata).toEqual({ permanent: true });
  });

  it("does not write again when the key is already stamped", async () => {
    await env.BUILDS.put("b:stmpbd22", validBuild, { metadata: { permanent: true } });
    const put = vi.spyOn(env.BUILDS, "put");
    try {
      const res = await fetchWith(env, new Request("https://x/builds/stmpbd22"));
      expect(res.status).toBe(200);
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
  });

  it("still serves the read when the re-put throws", async () => {
    await env.BUILDS.put("b:fpgrade2", validBuild, { expirationTtl: 3600 });
    const failingPut = vi.fn().mockRejectedValue(new Error("KV put limit exceeded"));
    const flaky = {
      getWithMetadata: (key: string) => env.BUILDS.getWithMetadata(key),
      put: failingPut,
    } as unknown as KVNamespace;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await fetchWith(
        { ...env, BUILDS: flaky },
        new Request("https://x/builds/fpgrade2"),
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(validBuild);
      expect(failingPut).toHaveBeenCalledOnce();
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("returns 404 for an absent key without writing", async () => {
    const put = vi.spyOn(env.BUILDS, "put");
    try {
      const res = await fetchWith(env, new Request("https://x/builds/nnxxxxxx"));
      expect(res.status).toBe(404);
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
  });
});
