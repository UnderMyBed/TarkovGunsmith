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

  it("dedupes concurrent reads of one legacy key to at most one write", async () => {
    await env.BUILDS.put("b:cncrnt22", validBuild, { expirationTtl: 3600 });
    const put = vi.spyOn(env.BUILDS, "put");
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => fetchWith(env, new Request("https://x/builds/cncrnt22"))),
      );
      for (const r of results) expect(r.status).toBe(200);
      const upgrades = put.mock.calls.filter(([k]) => k === "b:cncrnt22");
      expect(upgrades.length).toBeLessThanOrEqual(1);
    } finally {
      put.mockRestore();
    }
    expect((await entry("b:cncrnt22"))?.expiration).toBeUndefined();
  });

  it("skips the upgrade when the colo marker is already present", async () => {
    await env.BUILDS.put("b:mrkd2222", validBuild, { expirationTtl: 3600 });
    await caches.default.put(
      new Request(`https://upgrade-marker.internal/${encodeURIComponent("b:mrkd2222")}`),
      new Response("1", { headers: { "Cache-Control": "max-age=300" } }),
    );
    const put = vi.spyOn(env.BUILDS, "put");
    try {
      const res = await fetchWith(env, new Request("https://x/builds/mrkd2222"));
      expect(res.status).toBe(200);
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
  });

  it("forking a legacy pair writes only the stamped copy, never upgrades the source", async () => {
    await env.BUILDS.put("p:frkgcy22", validPair, { expirationTtl: 3600 });
    const put = vi.spyOn(env.BUILDS, "put");
    try {
      const res = await fetchWith(env, post("/pairs/frkgcy22/fork", "", "198.51.100.5"));
      expect(res.status).toBe(201);
      const { id } = await res.json<{ id: string }>();
      const written = put.mock.calls.map(([k]) => k).filter((k) => k.startsWith("p:"));
      expect(written).toEqual([`p:${id}`]);
    } finally {
      put.mockRestore();
    }
    expect((await entry("p:frkgcy22"))?.expiration).toBeTypeOf("number");
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
