import { describe, expect, it, vi } from "vitest";
import { fetchTraders, tradersSchema } from "./traders.js";
import { createTarkovClient } from "../client.js";

const prapor = { id: "t1", name: "Prapor", normalizedName: "prapor" };
const fence = { id: "t8", name: "Fence", normalizedName: "fence" };

const fixture = { data: { traders: [prapor, fence] } };

describe("tradersSchema", () => {
  it("parses a valid response", () => {
    expect(tradersSchema.safeParse(fixture.data).success).toBe(true);
  });
});

describe("fetchTraders", () => {
  it("returns only profile-gating traders (excludes Fence)", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchTraders(client);
    expect(result.map((t) => t.normalizedName)).toEqual(["prapor"]);
  });
});
