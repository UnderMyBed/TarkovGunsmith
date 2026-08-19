import { describe, expect, it, vi } from "vitest";
import { createTarkovClient, TarkovApiError } from "./client.js";

function stubFetch(routes: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (key === undefined) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(
      new Response(JSON.stringify(routes[key]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}

const BASE = "https://json.tarkov.dev/regular/";

describe("createTarkovClient", () => {
  it("fetches a resource and merges its _en translations", async () => {
    const client = createTarkovClient(
      BASE,
      stubFetch({
        "/traders": {
          data: { t1: { id: "t1", name: "t1 Nickname" } },
          translations: ["$.data.*.name"],
        },
        "/traders_en": { data: { "t1 Nickname": "Prapor" } },
      }),
    );
    const result = await client.fetchResource<Record<string, { name: string }>>("traders");
    expect(result.t1!.name).toBe("Prapor");
  });

  it("still returns data when the translation document is missing", async () => {
    const client = createTarkovClient(
      BASE,
      stubFetch({
        "/traders": { data: { t1: { name: "t1 Nickname" } }, translations: ["$.data.*.name"] },
      }),
    );
    const result = await client.fetchResource<Record<string, { name: string }>>("traders");
    expect(result.t1!.name).toBe("t1 Nickname");
  });

  it("throws TarkovApiError carrying the resource and status", async () => {
    const client = createTarkovClient(BASE, stubFetch({}));
    await expect(client.fetchResource("items")).rejects.toMatchObject({
      name: "TarkovApiError",
      resource: "items",
      status: 404,
    });
  });

  it("fetches a resource once and serves repeats from cache", async () => {
    const spy = stubFetch({ "/items": { data: { a: 1 } }, "/items_en": { data: {} } });
    const client = createTarkovClient(BASE, spy);
    await client.fetchResource("items");
    await client.fetchResource("items");
    expect(spy.mock.calls).toHaveLength(2);
  });

  it("dedupes concurrent requests for the same resource", async () => {
    const spy = stubFetch({ "/items": { data: { a: 1 } }, "/items_en": { data: {} } });
    const client = createTarkovClient(BASE, spy);
    await Promise.all([client.fetchResource("items"), client.fetchResource("items")]);
    expect(spy.mock.calls).toHaveLength(2);
  });

  it("falls back to the global fetch when no fetchImpl is supplied", async () => {
    // Covers the `fetchImpl !== undefined ? fetchImpl(...) : fetch(...)` branch: every other
    // test in this file passes an explicit stub, so the global-fetch arm is otherwise dead.
    const spy = stubFetch({ "/items": { data: { a: 1 } }, "/items_en": { data: {} } });
    vi.stubGlobal("fetch", spy);
    try {
      const client = createTarkovClient(BASE);
      const result = await client.fetchResource<{ a: number }>("items");
      expect(result).toEqual({ a: 1 });
      expect(spy).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats a translation fetch that throws (not just a non-ok response) as absent", async () => {
    // `getJson(..., false).catch(() => undefined)` only has something to catch when the
    // fetchImpl itself rejects — a 404 response is already handled inside `getJson` via the
    // `!required` branch and never reaches `.catch`. A network-level failure (DNS, abort,
    // offline) is the case that actually exercises the `.catch`.
    const flakyTranslations = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      if (url.endsWith("_en")) return Promise.reject(new Error("network down"));
      if (url.endsWith("/items")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { a: 1 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    const client = createTarkovClient(BASE, flakyTranslations);
    await expect(client.fetchResource("items")).resolves.toEqual({ a: 1 });
  });

  it("does not cache a failure", async () => {
    let attempt = 0;
    const flaky = vi.fn(() => {
      attempt += 1;
      if (attempt <= 2) return Promise.resolve(new Response("boom", { status: 500 }));
      return Promise.resolve(new Response(JSON.stringify({ data: { a: 1 } }), { status: 200 }));
    });
    const client = createTarkovClient(BASE, flaky);
    await expect(client.fetchResource("items")).rejects.toBeInstanceOf(TarkovApiError);
    await expect(client.fetchResource("items")).resolves.toEqual({ a: 1 });
  });
});
