import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  checkRateLimit,
  recordAdmission,
  secondsUntilUtcMidnight,
  clientIp,
  tooManyRequestsResponse,
  PER_IP_DAILY_WRITE_LIMIT,
} from "./rate-limit.js";

const IP = "203.0.113.5"; // TEST-NET-3, RFC 5737 — safe to hardcode in tests.
const NOW = new Date("2026-08-19T12:00:00.000Z");

describe("checkRateLimit / recordAdmission", () => {
  beforeEach(async () => {
    const list = await env.BUILDS.list({ prefix: "" });
    await Promise.all(list.keys.map((k) => env.BUILDS.delete(k.name)));
  });

  it("allows a fresh IP with count 0", async () => {
    const status = await checkRateLimit(env.BUILDS, IP, NOW);
    expect(status.allowed).toBe(true);
    expect(status.count).toBe(0);
  });

  it("checkRateLimit never writes to KV, even when called repeatedly", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(env.BUILDS, IP, NOW);
    }
    // No recordAdmission call anywhere above — the key must not exist.
    const list = await env.BUILDS.list({ prefix: "rl:" });
    expect(list.keys).toHaveLength(0);
  });

  it("recordAdmission persists the incremented count for subsequent checks", async () => {
    const first = await checkRateLimit(env.BUILDS, IP, NOW);
    await recordAdmission(env.BUILDS, IP, first.count, NOW);
    const second = await checkRateLimit(env.BUILDS, IP, NOW);
    expect(second.count).toBe(1);
  });

  it("blocks once PER_IP_DAILY_WRITE_LIMIT admissions have been recorded", async () => {
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT; i++) {
      const status = await checkRateLimit(env.BUILDS, IP, NOW);
      expect(status.allowed).toBe(true);
      await recordAdmission(env.BUILDS, IP, status.count, NOW);
    }
    const blocked = await checkRateLimit(env.BUILDS, IP, NOW);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(PER_IP_DAILY_WRITE_LIMIT);
  });

  it("tracks separate IPs independently", async () => {
    for (let i = 0; i < PER_IP_DAILY_WRITE_LIMIT; i++) {
      const status = await checkRateLimit(env.BUILDS, IP, NOW);
      await recordAdmission(env.BUILDS, IP, status.count, NOW);
    }
    const otherIp = await checkRateLimit(env.BUILDS, "198.51.100.9", NOW);
    expect(otherIp.allowed).toBe(true);
    expect(otherIp.count).toBe(0);
  });

  it("scopes the counter to the UTC calendar day", async () => {
    const lateInDay = new Date("2026-08-19T23:59:59.000Z");
    const status = await checkRateLimit(env.BUILDS, IP, lateInDay);
    await recordAdmission(env.BUILDS, IP, status.count, lateInDay);

    const nextDay = new Date("2026-08-20T00:00:01.000Z");
    const afterMidnight = await checkRateLimit(env.BUILDS, IP, nextDay);
    expect(afterMidnight.count).toBe(0);
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("computes the exact remaining seconds in the UTC day", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-08-19T23:59:00.000Z"))).toBe(60);
    expect(secondsUntilUtcMidnight(new Date("2026-08-19T00:00:00.000Z"))).toBe(24 * 60 * 60);
  });
});

describe("clientIp", () => {
  it("reads CF-Connecting-IP", () => {
    const request = new Request("https://x/builds", {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    });
    expect(clientIp(request)).toBe("203.0.113.7");
  });

  it("falls back to a shared bucket when the header is absent", () => {
    const request = new Request("https://x/builds");
    expect(clientIp(request)).toBe("unknown");
  });
});

describe("tooManyRequestsResponse", () => {
  it("returns 429 with a Retry-After header", () => {
    const res = tooManyRequestsResponse(NOW);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe(String(secondsUntilUtcMidnight(NOW)));
  });
});
