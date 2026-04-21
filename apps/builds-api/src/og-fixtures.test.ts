import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { maybeSeedOgFixtures } from "./og-fixtures.js";

describe("maybeSeedOgFixtures", () => {
  beforeEach(async () => {
    const list = await env.BUILDS.list({ prefix: "" });
    await Promise.all(list.keys.map((k) => env.BUILDS.delete(k.name)));
  });

  it("is a no-op when env vars are unset", async () => {
    await maybeSeedOgFixtures({
      ...env,
      OG_FIXTURE_BUILD_ID: "",
      OG_FIXTURE_PAIR_ID: "",
    });
    const list = await env.BUILDS.list({ prefix: "" });
    expect(list.keys).toHaveLength(0);
  });

  it("seeds a build when OG_FIXTURE_BUILD_ID is set and key is absent", async () => {
    await maybeSeedOgFixtures({
      ...env,
      OG_FIXTURE_BUILD_ID: "ogfix001",
      OG_FIXTURE_PAIR_ID: "",
    });
    const value = await env.BUILDS.get("b:ogfix001");
    expect(value).not.toBeNull();
    const parsed = JSON.parse(value!) as { version: number; weaponId: string };
    expect(parsed.version).toBe(4);
    expect(parsed.weaponId.length).toBeGreaterThan(0);
  });

  it("does not overwrite an existing fixture key", async () => {
    await env.BUILDS.put("b:ogfix001", '{"sentinel":true}');
    await maybeSeedOgFixtures({
      ...env,
      OG_FIXTURE_BUILD_ID: "ogfix001",
      OG_FIXTURE_PAIR_ID: "",
    });
    const value = await env.BUILDS.get("b:ogfix001");
    expect(value).toBe('{"sentinel":true}');
  });

  it("seeds a pair when OG_FIXTURE_PAIR_ID is set", async () => {
    await maybeSeedOgFixtures({
      ...env,
      OG_FIXTURE_BUILD_ID: "",
      OG_FIXTURE_PAIR_ID: "ogfix002",
    });
    const value = await env.BUILDS.get("p:ogfix002");
    expect(value).not.toBeNull();
    const parsed = JSON.parse(value!) as { v: number; left: unknown; right: unknown };
    expect(parsed.v).toBe(1);
    expect(parsed.left).not.toBeNull();
    expect(parsed.right).not.toBeNull();
  });
});
