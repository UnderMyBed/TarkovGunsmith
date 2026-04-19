import { describe, expect, it, vi } from "vitest";
import { saveBuild, loadBuild, LoadBuildError, type LoadBuildErrorCode } from "./buildsApi.js";
import type { BuildV1 } from "./build-schema.js";

const sampleV1: BuildV1 = {
  version: 1,
  weaponId: "weapon-abc",
  modIds: ["mod-1"],
  createdAt: "2026-04-19T12:00:00.000Z",
};

function mockFetch(impl: (url: string, init?: RequestInit) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return Promise.resolve(impl(url, init));
  }) as unknown as typeof fetch;
}

describe("saveBuild", () => {
  it("POSTs JSON to the builds endpoint and returns the id+url", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe("/api/builds");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
      expect(JSON.parse(init?.body as string)).toEqual(sampleV1);
      return new Response(JSON.stringify({ id: "k7m4n8p2", url: "https://x/builds/k7m4n8p2" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const out = await saveBuild(fetchImpl, sampleV1);
    expect(out).toEqual({ id: "k7m4n8p2", url: "https://x/builds/k7m4n8p2" });
  });

  it("throws on a non-201 response", async () => {
    const fetchImpl = mockFetch(() => new Response("nope", { status: 500 }));
    await expect(saveBuild(fetchImpl, sampleV1)).rejects.toThrow(/saveBuild failed.*500/);
  });

  it("throws on a malformed response body", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(JSON.stringify({ wrong: "shape" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(saveBuild(fetchImpl, sampleV1)).rejects.toThrow(/saveBuild/);
  });
});

describe("loadBuild", () => {
  it("GETs the build endpoint and parses a v1 response", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe("/api/builds/k7m4n8p2");
      return new Response(JSON.stringify(sampleV1), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const build = await loadBuild(fetchImpl, "k7m4n8p2");
    expect(build).toEqual(sampleV1);
  });

  it("throws LoadBuildError('invalid-id') for a malformed id", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 200 }));
    const err = await loadBuild(fetchImpl, "BAD-ID").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("invalid-id");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws LoadBuildError('not-found') on 404", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 404 }));
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("not-found");
  });

  it("throws LoadBuildError('unreachable') on a network error", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new TypeError("network down")),
    ) as unknown as typeof fetch;
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("unreachable");
  });

  it("throws LoadBuildError('unreachable') on a non-404 non-200 status", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 500 }));
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("unreachable");
  });

  it("throws LoadBuildError('invalid-schema') when JSON doesn't match Build", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(JSON.stringify({ version: 999, totally: "wrong" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("invalid-schema");
  });

  it("throws LoadBuildError('invalid-schema') when the body isn't JSON", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response("not json at all", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("invalid-schema");
  });
});
