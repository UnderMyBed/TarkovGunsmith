import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchOgRowsForBuild } from "./og-graphql.js";

describe("fetchOgRowsForBuild", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a single GraphQL query and returns weapon + mods", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            weapon: {
              id: "w1",
              shortName: "M4A1",
              properties: { ergonomics: 48, recoilVertical: 120, recoilHorizontal: 344 },
            },
            mods: [
              {
                id: "m1",
                shortName: "ERGO",
                weight: 0.07,
                buyFor: [{ vendor: { normalizedName: "peacekeeper" }, priceRUB: 12000 }],
                properties: { ergonomics: 6, recoilModifier: -3 },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const out = await fetchOgRowsForBuild({ weaponId: "w1", modIds: ["m1"] });
    expect(out.weapon.shortName).toBe("M4A1");
    expect(out.mods).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.tarkov.dev/graphql",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on HTTP error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(fetchOgRowsForBuild({ weaponId: "w1", modIds: [] })).rejects.toThrow(/500/);
  });

  it("throws when GraphQL returns errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: "bad id" }] }), { status: 200 }),
    );
    await expect(fetchOgRowsForBuild({ weaponId: "bad", modIds: [] })).rejects.toThrow(/bad id/);
  });
});
