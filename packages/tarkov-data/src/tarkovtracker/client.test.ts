import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProgression } from "./client.js";
import { NetworkError, RateLimitedError, ShapeMismatchError, TokenInvalidError } from "./errors.js";
import rawFixture from "./__fixtures__/raw-progression.json" with { type: "json" };

describe("fetchProgression", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs tarkovtracker.io/api/v2/progress with Bearer auth and parses the response", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(rawFixture), { status: 200 }));
    const result = await fetchProgression("abc123");
    expect(result.playerLevel).toBe(25);
    expect(result.tasksProgress).toHaveLength(4);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tarkovtracker.io/api/v2/progress");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });

  it("throws TokenInvalidError on 401", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(fetchProgression("bad")).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it("throws RateLimitedError on 429", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    );
    await expect(fetchProgression("x")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("throws NetworkError when fetch rejects", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("dns"));
    await expect(fetchProgression("x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("throws ShapeMismatchError when the response body doesn't match the schema", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    await expect(fetchProgression("x")).rejects.toBeInstanceOf(ShapeMismatchError);
  });
});
