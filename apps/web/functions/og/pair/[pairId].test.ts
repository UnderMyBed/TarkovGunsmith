import { beforeEach, describe, expect, it, vi } from "vitest";

// Same edge-only module graph as /og/build/:id — see the note in
// `functions/og/build/[id].test.ts`. Only the surrounding renderer is stubbed;
// `onRequestGet` and `isValidBuildId` are real.
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: {} }));
vi.mock("@tarkov/og", () => ({
  embeddedFallbackPng: vi.fn(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
  embeddedFonts: vi.fn(() => []),
  hydratePairCard: vi.fn(),
  initResvg: vi.fn(() => Promise.resolve(undefined)),
  pairCard: vi.fn(),
  renderPng: vi.fn(() => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))),
}));
vi.mock("../../lib/og-graphql.js", () => ({ fetchOgRowsForBuild: vi.fn() }));
vi.mock("../../lib/og-availability.js", () => ({ availabilityPillText: vi.fn(() => "LL2") }));

const { onRequestGet } = await import("./[pairId].js");

const env = { BUILDS_API_URL: "https://api.example.com" };

function callWith(pairId: string) {
  return onRequestGet({
    params: { pairId },
    request: new Request(`https://site.pages.dev/og/pair/${encodeURIComponent(pairId)}`),
    env,
  } as unknown as Parameters<typeof onRequestGet>[0]) as Promise<Response>;
}

describe("/og/pair/:pairId — id validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(() => Promise.resolve(undefined)),
        put: vi.fn(() => Promise.resolve(undefined)),
      },
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it.each([
    ["a decoded path separator", "../healthz"],
    ["the encoded separator from the request line", "..%2Fhealthz"],
    ["a bare dot segment", ".."],
    ["an over-length id", "a".repeat(64)],
    ["an empty id", ""],
    ["an id outside the safe alphabet", "EFGH6789"],
  ])("rejects %s with 400 and no upstream fetch", async (_label, id) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await callWith(id);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a well-formed id through to the upstream fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));

    const res = await callWith("efgh6789");

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.example.com/pairs/efgh6789");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});
