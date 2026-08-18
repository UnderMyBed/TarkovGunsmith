import { describe, expect, it } from "vitest";
import { fetchTraders } from "./traders.js";
import { fixtureClient } from "../__fixtures__/client.js";

describe("fetchTraders", () => {
  it("returns traders with id, name and normalizedName", async () => {
    const traders = await fetchTraders(fixtureClient());
    expect(traders.length).toBeGreaterThan(0);
    for (const t of traders) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.normalizedName).toBe("string");
    }
  });

  it("resolves translated names rather than translation keys", async () => {
    const traders = await fetchTraders(fixtureClient());
    for (const t of traders) expect(t.name).not.toMatch(/ Nickname$/);
  });

  it("returns only profile-gating traders", async () => {
    const traders = await fetchTraders(fixtureClient());
    for (const t of traders) {
      expect([
        "prapor",
        "therapist",
        "skier",
        "peacekeeper",
        "mechanic",
        "ragman",
        "jaeger",
      ]).toContain(t.normalizedName);
    }
  });
});
