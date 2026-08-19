import { beforeEach, describe, expect, it, vi } from "vitest";

// The handler's module graph is edge-only: a `.wasm` import, the resvg/satori
// renderer, and base64 font blobs decoded at module load. None of that is
// reachable on the invalid-id path, but it all has to *load* for the module to
// import, so it is stubbed here. Nothing below stubs the code under test —
// `onRequestGet` and `isValidBuildId` are the real implementations.
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: {} }));
vi.mock("@tarkov/og", () => ({
  buildCard: vi.fn(),
  embeddedFallbackPng: vi.fn(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
  embeddedFonts: vi.fn(() => []),
  hydrateBuildCard: vi.fn(),
  initResvg: vi.fn(() => Promise.resolve(undefined)),
  renderPng: vi.fn(() => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))),
}));
vi.mock("../../lib/og-graphql.js", () => ({ fetchOgRowsForBuild: vi.fn() }));
vi.mock("../../lib/og-availability.js", () => ({ availabilityPillText: vi.fn(() => "LL2") }));

const { onRequestGet } = await import("./[id].js");

const env = { BUILDS_API_URL: "https://api.example.com" };

/** Invokes the handler the way Pages does: params already percent-decoded. */
function callWith(id: string) {
  return onRequestGet({
    params: { id },
    request: new Request(`https://site.pages.dev/og/build/${encodeURIComponent(id)}`),
    env,
    // The handler returns before touching any of these on the invalid-id path.
  } as unknown as Parameters<typeof onRequestGet>[0]) as Promise<Response>;
}

describe("/og/build/:id — id validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "caches",
      { default: { match: vi.fn(() => Promise.resolve(undefined)), put: vi.fn(() => Promise.resolve(undefined)) } },
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  // Every one of these is rejected WITHOUT a network call. The `fetch` spy is
  // the real assertion: on the unfixed handler each of these strings reaches
  // `fetch(\`${env.BUILDS_API_URL}/builds/${id}\`)`.
  it.each([
    ["a decoded path separator", "../healthz"],
    ["a decoded separator mid-id", "abc/../../healthz"],
    ["the encoded separator from the request line", "..%2Fhealthz"],
    ["a bare dot segment", ".."],
    ["an over-length id", "a".repeat(64)],
    ["an empty id", ""],
    ["an id outside the safe alphabet", "ABCD2345"],
  ])("rejects %s with 400 and no upstream fetch", async (_label, id) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await callWith(id);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid id");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not leak the rejected id into the log line", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await callWith("../../etc/passwd");
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("invalid-id");
    expect(logged).not.toContain("etc/passwd");
  });

  it("lets a well-formed id through to the upstream fetch", async () => {
    // Proves the guard is not simply refusing everything: a real id still
    // reaches the builds-api, at the exact path the Worker serves.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));

    const res = await callWith("abcd2345");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.example.com/builds/abcd2345");
    // 404 upstream → the "BUILD NOT FOUND" fallback card, unchanged by this fix.
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});
