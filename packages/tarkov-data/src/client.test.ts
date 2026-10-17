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

  it("fails a resource whose translation document is missing when translations are required", async () => {
    const client = createTarkovClient(
      BASE,
      stubFetch({
        "/traders": { data: { t1: { name: "t1 Nickname" } }, translations: ["$.data.*.name"] },
      }),
      undefined,
      { requireTranslations: true },
    );
    await expect(client.fetchResource("traders")).rejects.toMatchObject({
      name: "TarkovApiError",
      resource: "traders_en",
      status: 404,
      message: expect.stringContaining("404") as unknown,
    });
  });

  it.each([
    ["a body without `data`", { translations: { "t1 Nickname": "Prapor" } }, "no `data` object"],
    ["an array for `data`", { data: ["Prapor"] }, "no `data` object"],
    ["an empty `data`", { data: {} }, "`data` is empty"],
  ])("fails a required translation document served 200 with %s", async (_label, body, reason) => {
    const client = createTarkovClient(
      BASE,
      stubFetch({
        "/traders": { data: { t1: { name: "t1 Nickname" } }, translations: ["$.data.*.name"] },
        "/traders_en": body,
      }),
      undefined,
      { requireTranslations: true },
    );
    await expect(client.fetchResource("traders")).rejects.toMatchObject({
      name: "TarkovApiError",
      resource: "traders_en",
      status: 0,
      message: expect.stringContaining(reason) as unknown,
    });
  });

  it("leaves keys in place for a malformed translation document when not required", async () => {
    const client = createTarkovClient(
      BASE,
      stubFetch({
        "/traders": { data: { t1: { name: "t1 Nickname" } }, translations: ["$.data.*.name"] },
        "/traders_en": { translations: {} },
      }),
    );
    const result = await client.fetchResource<Record<string, { name: string }>>("traders");
    expect(result.t1!.name).toBe("t1 Nickname");
  });

  it("reports a translation fetch rejected with a non-Error value", async () => {
    const odd = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      if (url.endsWith("_en")) return Promise.reject("socket hang up"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.resolve(
        new Response(JSON.stringify({ data: {}, translations: ["$.x"] }), { status: 200 }),
      );
    });
    const client = createTarkovClient(BASE, odd, undefined, { requireTranslations: true });
    await expect(client.fetchResource("traders")).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("socket hang up") as unknown,
    });
  });

  it("fails a required translation document that cannot be reached, with status 0", async () => {
    const offline = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      if (url.endsWith("_en")) return Promise.reject(new Error("network down"));
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { t1: { name: "t1 Nickname" } }, translations: ["$.x"] }),
          { status: 200 },
        ),
      );
    });
    const client = createTarkovClient(BASE, offline, undefined, { requireTranslations: true });
    await expect(client.fetchResource("traders")).rejects.toMatchObject({
      resource: "traders_en",
      status: 0,
      message: expect.stringContaining("network down") as unknown,
    });
  });

  it("does not require translations for a document that lists none", async () => {
    const client = createTarkovClient(
      BASE,
      stubFetch({ "/barters": { data: [{ id: "b1" }] } }),
      undefined,
      { requireTranslations: true },
    );
    await expect(client.fetchResource("barters")).resolves.toEqual([{ id: "b1" }]);
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
    // A network-level failure (DNS, abort, offline) rejects the fetch itself rather than
    // returning a non-ok response; unrequired, it still leaves the keys in place.
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
