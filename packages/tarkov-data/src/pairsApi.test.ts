import { describe, it, expect, vi } from "vitest";
import { savePair, loadPair, forkPair, LoadPairError } from "./pairsApi.js";
import type { BuildPairV1 } from "./pair-schema.js";
import type { BuildV5 } from "./build-schema.js";

const validPair: BuildPairV1 = {
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
};

// A v5 build. Embedding a non-null side is the only way to exercise `upgradeLoadedBuild`
// inside `loadPair` — `validPair` above has both sides null. v5 (not v1) so the upgrade is
// visible: `upgradeLoadedBuild` deliberately leaves v1/v2 alone (migrateV1ToV2 needs the
// weapon's slot tree, which no transport module has), but v5→v6 (`migrateV5ToV6`) is a pure
// version stamp, so asserting `version === 6` afterward actually proves the branch ran.
const oldBuildSide: BuildV5 = {
  version: 5,
  weaponId: "weapon-abc",
  attachments: {},
  orphaned: [],
  createdAt: "2026-04-19T12:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("savePair", () => {
  it("POSTs to /api/pairs and returns { id, url }", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { id: "abc23456", url: "https://x/pairs/abc23456" }));
    const res = await savePair(fetchImpl, validPair);
    expect(res).toEqual({ id: "abc23456", url: "https://x/pairs/abc23456" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/pairs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on non-201", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(savePair(fetchImpl as unknown as typeof fetch, validPair)).rejects.toThrow();
  });

  it("throws on malformed response body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 123 }));
    await expect(savePair(fetchImpl as unknown as typeof fetch, validPair)).rejects.toThrow();
  });
});

describe("loadPair", () => {
  it("validates id format before the network call", async () => {
    const fetchImpl = vi.fn();
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "BAD-ID")).rejects.toMatchObject({
      code: "invalid-id",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns parsed pair on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, validPair));
    const res = await loadPair(fetchImpl, "abc23456");
    expect(res).toEqual(validPair);
  });

  it("throws LoadPairError code=not-found on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws LoadPairError code=unreachable on a non-200, non-404 status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("throws LoadPairError code=invalid-schema when the 200 body isn't JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("not json{", { status: 200, headers: {} }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "invalid-schema",
    });
  });

  it("upgrades an embedded pre-v6 build on each non-null side", async () => {
    const pairWithOldBuild: BuildPairV1 = {
      v: 1,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: oldBuildSide,
      right: oldBuildSide,
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, pairWithOldBuild));
    const res = await loadPair(fetchImpl, "abc23456");
    // upgradeLoadedBuild bumps `version` to CURRENT_BUILD_VERSION (6) — asserting it moved
    // off `1` is enough to prove the ternary took the `upgradeLoadedBuild(...)` arm rather
    // than passing the raw v1 build straight through.
    expect(res.left).not.toBeNull();
    expect(res.right).not.toBeNull();
    expect(res.left?.version).toBe(6);
    expect(res.right?.version).toBe(6);
  });

  it("throws LoadPairError code=unreachable on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("throws LoadPairError code=invalid-schema on malformed body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { notAPair: true }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "invalid-schema",
    });
  });
});

describe("forkPair", () => {
  it("POSTs to /api/pairs/:id/fork and returns { id, url }", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { id: "xyz98765", url: "https://x/pairs/xyz98765" }));
    const res = await forkPair(fetchImpl, "abc23456");
    expect(res).toEqual({ id: "xyz98765", url: "https://x/pairs/xyz98765" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/pairs/abc23456/fork",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("validates id format", async () => {
    const fetchImpl = vi.fn();
    await expect(forkPair(fetchImpl as unknown as typeof fetch, "BAD-ID")).rejects.toMatchObject({
      code: "invalid-id",
    });
  });

  it("throws a plain Error on a non-201 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(forkPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toThrow(
      /forkPair failed.*500/,
    );
  });
});

describe("LoadPairError", () => {
  it("has a .code and a .cause", () => {
    const err = new LoadPairError("not-found", "missing", new Error("root"));
    expect(err.code).toBe("not-found");
    expect(err.cause).toBeInstanceOf(Error);
  });
});
