import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Og from "@tarkov/og";
import type { BuildCardViewModel, PairCardViewModel } from "@tarkov/og";
import { capturedBuilderData } from "../../src/test/captured-data.js";
import { resetOgData } from "../lib/og-graphql.js";

// Both handlers end to end over the captured game data: the stored record, its upgrade, the
// snapshot read through `ASSETS`, the hydrator and the edge cache are all real. Only the
// edge-only renderer is stubbed — `buildCard` / `pairCard` hand the view model straight to
// `renderPng`, so a test can read what the card would draw.
const rendered: unknown[] = [];
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: {} }));
vi.mock("@tarkov/og", async (importOriginal) => {
  const real = await importOriginal<typeof Og>();
  return {
    ...real,
    buildCard: (vm: unknown) => vm,
    pairCard: (vm: unknown) => vm,
    embeddedFonts: () => [],
    embeddedFallbackPng: () => new Uint8Array([0xfa, 0x11]),
    initResvg: () => Promise.resolve(undefined),
    renderPng: (vm: unknown) => {
      rendered.push(vm);
      return Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    },
  };
});

const { onRequestGet: buildCard } = await import("./build/[id].js");
const { onRequestGet: pairCard } = await import("./pair/[pairId].js");

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const M4_CARBINE_HANDGUARD = "5ae30db85acfc408fb139a05";
const COLT_A2_GRIP = "55d4b9964bdc2d1d4e8b456e";
const CREATED = "2026-04-21T00:00:00.000Z";
const V1_BUILD = {
  version: 1,
  weaponId: M4A1,
  modIds: [M4A1_UPPER, M4_CARBINE_HANDGUARD, COLT_A2_GRIP],
  createdAt: CREATED,
};

let cache: Map<string, Response>;
let stored: Record<string, unknown>;
let upstreamCalls: string[];

async function assets(): Promise<Fetcher> {
  const data = await capturedBuilderData();
  const bodies: Record<string, unknown> = {
    "/data/builder-snapshot.json": data.snapshot,
    "/data/builder-prices.json": data.prices,
  };
  return {
    fetch: (input: string) =>
      Promise.resolve(new Response(JSON.stringify(bodies[new URL(input).pathname]))),
  } as unknown as Fetcher;
}

async function call(
  handler: typeof buildCard | typeof pairCard,
  param: "id" | "pairId",
  url: string,
): Promise<Response> {
  const id = new URL(url).pathname.split("/").pop()!;
  return handler({
    params: { [param]: id },
    request: new Request(url),
    env: { BUILDS_API_URL: "https://api.example.com", ASSETS: await assets() },
  } as unknown as Parameters<typeof buildCard>[0]);
}

beforeEach(() => {
  rendered.length = 0;
  resetOgData();
  cache = new Map();
  stored = {};
  upstreamCalls = [];
  vi.stubGlobal("caches", {
    default: {
      match: (req: Request) => Promise.resolve(cache.get(req.url)?.clone()),
      put: (req: Request, res: Response) => {
        cache.set(req.url, res);
        return Promise.resolve(undefined);
      },
    },
  });
  vi.stubGlobal("fetch", (input: string) => {
    upstreamCalls.push(input);
    const key = input.replace("https://api.example.com/", "");
    return Promise.resolve(
      key in stored
        ? new Response(JSON.stringify(stored[key]))
        : new Response("not found", { status: 404 }),
    );
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/og/build/:id over stored records", () => {
  it("draws a v1 build with its mod ids placed on the weapon", async () => {
    stored["builds/abcd2345"] = V1_BUILD;
    const res = await call(buildCard, "id", "https://site.pages.dev/og/build/abcd2345");
    expect(res.headers.get("cache-control")).toBe("public, max-age=2592000, immutable");
    const vm = rendered[0] as BuildCardViewModel;
    expect(vm.title).toBe("M4A1");
    expect(vm.modCount).toBe(3);
    // The receiver's own weight is in: no part list could add up to less.
    expect(vm.stats.weight).toBeGreaterThan(0.75);
  });

  it("weighs a bare v4 M4A1 at 0.75 kg", async () => {
    stored["builds/abcd2345"] = {
      version: 4,
      weaponId: M4A1,
      attachments: {},
      orphaned: [],
      createdAt: CREATED,
    };
    await call(buildCard, "id", "https://site.pages.dev/og/build/abcd2345");
    expect((rendered[0] as BuildCardViewModel).stats.weight).toBe(0.75);
  });

  it("serves the fallback, uncached, for a record the Builder would refuse, naming the id", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stored["builds/abcd2345"] = { version: 6, weaponId: M4A1 };
    const res = await call(buildCard, "id", "https://site.pages.dev/og/build/abcd2345");
    expect(rendered).toHaveLength(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xfa, 0x11]));
    expect(cache.size).toBe(0);
    const logged = JSON.parse(String(errors.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(logged).toMatchObject({ route: "og/build", id: "abcd2345", status: 500 });
  });

  it("answers two URLs that differ only in their query string from one cache entry", async () => {
    stored["builds/abcd2345"] = V1_BUILD;
    const first = await call(buildCard, "id", "https://site.pages.dev/og/build/abcd2345?x=1");
    const second = await call(buildCard, "id", "https://site.pages.dev/og/build/abcd2345?x=2");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect([...cache.keys()]).toEqual(["https://site.pages.dev/og/build/abcd2345"]);
    // The second request never reached the builds-api or the renderer.
    expect(upstreamCalls).toEqual(["https://api.example.com/builds/abcd2345"]);
    expect(rendered).toHaveLength(1);
  });
});

describe("/og/pair/:pairId over stored records", () => {
  it("draws a pair whose left side is a v1 build", async () => {
    stored["pairs/efgh6789"] = { v: 1, createdAt: CREATED, left: V1_BUILD, right: null };
    const res = await call(pairCard, "pairId", "https://site.pages.dev/og/pair/efgh6789");
    expect(res.headers.get("cache-control")).toBe("public, max-age=2592000, immutable");
    const vm = rendered[0] as PairCardViewModel;
    expect(vm.right).toBeNull();
    expect(vm.left?.weapon).toBe("M4A1");
    expect(vm.left?.modCount).toBe(3);
    expect(vm.left?.stats.weight).toBeGreaterThan(0.75);
  });

  it("serves the fallback, uncached, for a pair Compare would refuse, naming the id", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stored["pairs/efgh6789"] = { v: 1, left: null, right: null };
    const res = await call(pairCard, "pairId", "https://site.pages.dev/og/pair/efgh6789");
    expect(rendered).toHaveLength(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const logged = JSON.parse(String(errors.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(logged).toMatchObject({ route: "og/pair", id: "efgh6789", status: 500 });
  });

  it("answers two URLs that differ only in their query string from one cache entry", async () => {
    stored["pairs/efgh6789"] = { v: 1, createdAt: CREATED, left: V1_BUILD, right: null };
    await call(pairCard, "pairId", "https://site.pages.dev/og/pair/efgh6789?a");
    await call(pairCard, "pairId", "https://site.pages.dev/og/pair/efgh6789?b");
    expect([...cache.keys()]).toEqual(["https://site.pages.dev/og/pair/efgh6789"]);
    expect(rendered).toHaveLength(1);
  });
});
