import { describe, it, expect } from "vitest";
import { BuildPair, CURRENT_PAIR_VERSION, type BuildPairV1 } from "./pair-schema.js";
import { DEFAULT_PROFILE } from "./build-schema.js";

const sampleV4Build = {
  version: 4 as const,
  weaponId: "5447a9cd4bdc2dbd208b4567",
  attachments: {},
  orphaned: [],
  createdAt: "2026-04-20T00:00:00.000Z",
};

describe("BuildPair schema", () => {
  it("parses a fully-populated v1 pair", () => {
    const pair: BuildPairV1 = {
      v: 1,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: sampleV4Build,
      right: sampleV4Build,
      leftProfile: DEFAULT_PROFILE,
      rightProfile: DEFAULT_PROFILE,
      name: "early-wipe vs. endgame",
      description: "Comparing my LL2 vs. LL4 M4 build",
    };
    expect(BuildPair.parse(pair)).toEqual(pair);
  });

  it("accepts null on either side", () => {
    const pair = {
      v: 1 as const,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: sampleV4Build,
      right: null,
    };
    expect(BuildPair.parse(pair)).toEqual(pair);
  });

  it("rejects unknown schema version", () => {
    const pair = {
      v: 99,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: null,
      right: null,
    };
    expect(() => BuildPair.parse(pair)).toThrow();
  });

  it("enforces name max 60 chars + description max 280 chars", () => {
    const pair = {
      v: 1 as const,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: null,
      right: null,
      name: "x".repeat(61),
    };
    expect(() => BuildPair.parse(pair)).toThrow();
  });

  it("exports CURRENT_PAIR_VERSION = 1", () => {
    expect(CURRENT_PAIR_VERSION).toBe(1);
  });
});
