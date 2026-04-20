import { describe, expect, it } from "vitest";
import {
  Build,
  BuildV1,
  BuildV2,
  BuildV3,
  PlayerProfile,
  CURRENT_BUILD_VERSION,
} from "./build-schema.js";

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

describe("BuildV2", () => {
  const validV2 = {
    version: 2 as const,
    weaponId: "weapon-abc",
    attachments: { mod_scope: "mod-s1", "mod_muzzle/mod_muzzle_adapter": "mod-m2" },
    orphaned: [],
    createdAt: "2026-04-20T12:00:00.000Z",
  };

  it("parses a valid v2 payload", () => {
    expect(BuildV2.parse(validV2)).toEqual(validV2);
  });

  it("rejects a wrong version literal", () => {
    expect(BuildV2.safeParse({ ...validV2, version: 1 }).success).toBe(false);
  });

  it("rejects empty slot paths in attachments", () => {
    expect(BuildV2.safeParse({ ...validV2, attachments: { "": "mod-x" } }).success).toBe(false);
  });

  it("rejects empty item ids in attachments", () => {
    expect(BuildV2.safeParse({ ...validV2, attachments: { mod_scope: "" } }).success).toBe(false);
  });

  it("rejects more than 64 orphaned items", () => {
    const orphaned = Array.from({ length: 65 }, (_, i) => `o-${i}`);
    expect(BuildV2.safeParse({ ...validV2, orphaned }).success).toBe(false);
  });
});

describe("Build (discriminated union) — v2", () => {
  it("dispatches to BuildV2 when version is 2", () => {
    const v2 = {
      version: 2 as const,
      weaponId: "w",
      attachments: {},
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    expect(Build.parse(v2).version).toBe(2);
  });
});

describe("PlayerProfile", () => {
  const validProfile = {
    mode: "basic" as const,
    traders: {
      prapor: 2,
      therapist: 1,
      skier: 1,
      peacekeeper: 1,
      mechanic: 1,
      ragman: 1,
      jaeger: 1,
    },
    flea: false,
  };
  it("parses a valid basic profile", () => {
    expect(PlayerProfile.parse(validProfile)).toEqual(validProfile);
  });
  it("parses advanced mode with quests", () => {
    const parsed = PlayerProfile.parse({
      ...validProfile,
      mode: "advanced",
      completedQuests: ["q1"],
    });
    expect(parsed.completedQuests).toEqual(["q1"]);
  });
  it("rejects trader LL above 4", () => {
    expect(
      PlayerProfile.safeParse({ ...validProfile, traders: { ...validProfile.traders, prapor: 5 } })
        .success,
    ).toBe(false);
  });
  it("rejects trader LL below 1", () => {
    expect(
      PlayerProfile.safeParse({ ...validProfile, traders: { ...validProfile.traders, prapor: 0 } })
        .success,
    ).toBe(false);
  });
});

describe("BuildV3", () => {
  const v3base = {
    version: 3 as const,
    weaponId: "w",
    attachments: {},
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };
  it("parses without profileSnapshot", () => {
    expect(BuildV3.parse(v3base).profileSnapshot).toBeUndefined();
  });
  it("parses with profileSnapshot", () => {
    const profile = {
      mode: "basic" as const,
      traders: {
        prapor: 1,
        therapist: 1,
        skier: 1,
        peacekeeper: 1,
        mechanic: 1,
        ragman: 1,
        jaeger: 1,
      },
      flea: true,
    };
    expect(BuildV3.parse({ ...v3base, profileSnapshot: profile }).profileSnapshot).toEqual(profile);
  });
});

describe("Build (discriminated union) — v3", () => {
  it("dispatches to BuildV3 when version is 3", () => {
    const v3 = {
      version: 3 as const,
      weaponId: "w",
      attachments: {},
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    expect(Build.parse(v3).version).toBe(3);
  });
});

describe("CURRENT_BUILD_VERSION", () => {
  it("matches the latest BuildV* variant in the discriminated union", () => {
    expect(CURRENT_BUILD_VERSION).toBe(3);
  });
});
