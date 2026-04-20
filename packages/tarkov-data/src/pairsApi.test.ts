import { describe, it, expect, vi } from "vitest";
import { savePair, loadPair, forkPair, LoadPairError } from "./pairsApi.js";
import type { BuildPairV1 } from "./pair-schema.js";

const validPair: BuildPairV1 = {
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
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
    const res = await savePair(fetchImpl as unknown as typeof fetch, validPair);
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
    const res = await loadPair(fetchImpl as unknown as typeof fetch, "abc23456");
    expect(res).toEqual(validPair);
  });

  it("throws LoadPairError code=not-found on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "not-found",
    });
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
    const res = await forkPair(fetchImpl as unknown as typeof fetch, "abc23456");
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
});

describe("LoadPairError", () => {
  it("has a .code and a .cause", () => {
    const err = new LoadPairError("not-found", "missing", new Error("root"));
    expect(err.code).toBe("not-found");
    expect(err.cause).toBeInstanceOf(Error);
  });
});
