import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "./_middleware.js";

const env = { BUILDS_API_URL: "https://api.example.com" };

/**
 * Drives the middleware the way Pages does. `next()` stands in for "serve the
 * SPA shell" — the middleware returning it unchanged is the pass-through case.
 */
function callWith(path: string) {
  const shell = new Response("<html><head></head><body></body></html>", {
    headers: { "content-type": "text/html" },
  });
  const next = vi.fn(() => Promise.resolve(shell));
  const promise = onRequest({
    request: new Request(`https://site.pages.dev${path}`),
    env,
    next,
  } as unknown as Parameters<typeof onRequest>[0]) as Promise<Response>;
  return { promise, next, shell };
}

describe("_middleware — OG injection is gated on a valid id", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // A `/` cannot survive the single-segment route match, so the interesting
  // cases here are the ones the OLD `[a-zA-Z0-9_-]{4,16}` class waved through:
  // uppercase, `0`/`1`/`o`/`i`/`l`, hyphens, underscores, and any length 4-16.
  // Each of these used to cost a subrequest to the builds-api that could only
  // ever come back 400.
  it.each([
    ["/builder/ABCD2345", "uppercase"],
    ["/builder/abc-2345", "a hyphen"],
    ["/builder/abc_2345", "an underscore"],
    ["/builder/abcd", "under length"],
    ["/builder/abcd23456789abcd", "over length"],
    ["/builder/abcd2340", "a digit outside the alphabet"],
    ["/builder/abcd234o", "a letter outside the alphabet"],
    ["/builder/compare/ABCD2345", "uppercase (pair)"],
    ["/builder/compare/abc-2345", "a hyphen (pair)"],
  ])("%s (%s) passes through untouched, with no upstream fetch", async (path) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { promise, next, shell } = callWith(path);

    await expect(promise).resolves.toBe(shell);
    expect(next).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes non-builder paths through untouched", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { promise, shell } = callWith("/calc");

    await expect(promise).resolves.toBe(shell);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches the build for a well-formed id", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));
    const { promise, shell } = callWith("/builder/abcd2345");

    // Upstream 404 → the shell is returned unmodified; the assertion that
    // matters is the URL the middleware asked for.
    await expect(promise).resolves.toBe(shell);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.example.com/builds/abcd2345");
  });

  it("fetches the pair for a well-formed pair id", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));
    const { promise } = callWith("/builder/compare/efgh6789");

    await promise;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.example.com/pairs/efgh6789");
  });
});
