import { describe, expect, it } from "vitest";
import { Build, BuildV1, CURRENT_BUILD_VERSION } from "./build-schema.js";

const validV1 = {
  version: 1 as const,
  weaponId: "weapon-abc",
  modIds: ["mod-1", "mod-2"],
  createdAt: "2026-04-19T12:00:00.000Z",
};

describe("BuildV1", () => {
  it("parses a valid v1 payload", () => {
    expect(BuildV1.parse(validV1)).toEqual(validV1);
  });

  it("rejects a missing version discriminator", () => {
    const { version: _v, ...bad } = validV1;
    expect(BuildV1.safeParse(bad).success).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    expect(BuildV1.safeParse({ ...validV1, version: 2 }).success).toBe(false);
  });

  it("rejects an empty weaponId", () => {
    expect(BuildV1.safeParse({ ...validV1, weaponId: "" }).success).toBe(false);
  });

  it("rejects more than 64 mods", () => {
    const mods = Array.from({ length: 65 }, (_, i) => `mod-${i}`);
    expect(BuildV1.safeParse({ ...validV1, modIds: mods }).success).toBe(false);
  });

  it("rejects an empty string in modIds", () => {
    expect(BuildV1.safeParse({ ...validV1, modIds: ["mod-1", ""] }).success).toBe(false);
  });

  it("rejects a malformed createdAt", () => {
    expect(BuildV1.safeParse({ ...validV1, createdAt: "yesterday" }).success).toBe(false);
  });
});

describe("Build (discriminated union)", () => {
  it("dispatches on version to BuildV1", () => {
    const parsed = Build.parse(validV1);
    expect(parsed.version).toBe(1);
  });

  it("rejects an unknown version", () => {
    expect(Build.safeParse({ ...validV1, version: 99 }).success).toBe(false);
  });
});

describe("CURRENT_BUILD_VERSION", () => {
  it("is 1 for PR 1 of the Builder Robustness arc", () => {
    expect(CURRENT_BUILD_VERSION).toBe(1);
  });
});
