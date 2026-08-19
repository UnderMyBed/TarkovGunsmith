import { describe, expect, it } from "vitest";
import {
  Build,
  BuildV1,
  BuildV2,
  BuildV3,
  BuildV4,
  BuildV5,
  BuildV6,
  PlayerProfile,
  DEFAULT_PROFILE,
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
    expect(PlayerProfile.parse(validProfile)).toEqual({ ...validProfile, level: 1 });
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
    expect(BuildV3.parse({ ...v3base, profileSnapshot: profile }).profileSnapshot).toEqual({
      ...profile,
      level: 1,
    });
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

describe("BuildV4", () => {
  const v4base = {
    version: 4 as const,
    weaponId: "w",
    attachments: {},
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };
  it("parses without name/description", () => {
    const parsed = BuildV4.parse(v4base);
    expect(parsed.name).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });
  it("parses with name and description", () => {
    const parsed = BuildV4.parse({ ...v4base, name: "Meta M4", description: "budget-friendly" });
    expect(parsed.name).toBe("Meta M4");
    expect(parsed.description).toBe("budget-friendly");
  });
  it("rejects name longer than 60 chars", () => {
    expect(BuildV4.safeParse({ ...v4base, name: "x".repeat(61) }).success).toBe(false);
  });
  it("rejects description longer than 280 chars", () => {
    expect(BuildV4.safeParse({ ...v4base, description: "x".repeat(281) }).success).toBe(false);
  });
});

describe("Build (discriminated union) — v4", () => {
  it("dispatches to BuildV4 when version is 4", () => {
    const v4 = {
      version: 4 as const,
      weaponId: "w",
      attachments: {},
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    expect(Build.parse(v4).version).toBe(4);
  });
});

describe("PlayerProfile.level", () => {
  const levellessProfile = {
    mode: "advanced" as const,
    traders: {
      prapor: 4,
      therapist: 3,
      skier: 2,
      peacekeeper: 4,
      mechanic: 3,
      ragman: 2,
      jaeger: 1,
    },
    flea: true,
    completedQuests: ["gunsmith-master-part-1", "setup"],
  };

  // The guard that matters: every profile written to localStorage or embedded in a shared
  // build before this field existed has no `level`. If this ever fails, `useProfile`'s
  // catch-and-fall-back swallows it and silently wipes the user's trader LLs and quests.
  it("defaults to 1 on a stored profile that predates the field", () => {
    const parsed = PlayerProfile.parse(levellessProfile);
    expect(parsed.level).toBe(1);
    expect(parsed.traders.prapor).toBe(4);
    expect(parsed.completedQuests).toEqual(["gunsmith-master-part-1", "setup"]);
  });

  it("keeps an explicit level rather than overwriting it with the default", () => {
    expect(PlayerProfile.parse({ ...levellessProfile, level: 42 }).level).toBe(42);
  });

  it("rejects level below 1", () => {
    expect(PlayerProfile.safeParse({ ...levellessProfile, level: 0 }).success).toBe(false);
  });

  it("rejects level above 99", () => {
    expect(PlayerProfile.safeParse({ ...levellessProfile, level: 100 }).success).toBe(false);
  });

  it("rejects a non-integer level", () => {
    expect(PlayerProfile.safeParse({ ...levellessProfile, level: 20.5 }).success).toBe(false);
  });

  it("ships a level on DEFAULT_PROFILE", () => {
    expect(DEFAULT_PROFILE.level).toBe(1);
  });
});

describe("BuildV6", () => {
  const v6base = {
    version: 6 as const,
    weaponId: "w",
    attachments: {},
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };

  it("parses a valid v6 payload", () => {
    expect(BuildV6.parse(v6base).version).toBe(6);
  });

  it("carries v4's name/description and v3's profileSnapshot forward", () => {
    const parsed = BuildV6.parse({
      ...v6base,
      name: "Meta M4",
      description: "budget-friendly",
      profileSnapshot: { ...DEFAULT_PROFILE, level: 30 },
    });
    expect(parsed.name).toBe("Meta M4");
    expect(parsed.description).toBe("budget-friendly");
    expect(parsed.profileSnapshot?.level).toBe(30);
  });

  it("rejects a wrong version literal", () => {
    expect(BuildV6.safeParse({ ...v6base, version: 5 }).success).toBe(false);
  });
});

describe("Build (discriminated union) — v5 and v6", () => {
  const shared = {
    weaponId: "w",
    attachments: {},
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };

  it("dispatches to BuildV5 when version is 5", () => {
    expect(Build.parse({ ...shared, version: 5 }).version).toBe(5);
    expect(BuildV5.parse({ ...shared, version: 5 }).version).toBe(5);
  });

  it("dispatches to BuildV6 when version is 6", () => {
    expect(Build.parse({ ...shared, version: 6 }).version).toBe(6);
  });

  // A v5 build shared before this change carries a profileSnapshot with no level. It has
  // to keep parsing — a build that fails to load is worse than one that gates imperfectly.
  it("parses a v5 payload whose profileSnapshot predates level, defaulting it to 1", () => {
    const parsed = Build.parse({
      ...shared,
      version: 5,
      profileSnapshot: {
        mode: "basic",
        traders: {
          prapor: 3,
          therapist: 1,
          skier: 1,
          peacekeeper: 1,
          mechanic: 2,
          ragman: 1,
          jaeger: 1,
        },
        flea: true,
      },
    });
    expect(parsed.version).toBe(5);
    if (parsed.version === 5) {
      expect(parsed.profileSnapshot?.level).toBe(1);
      expect(parsed.profileSnapshot?.traders.prapor).toBe(3);
    }
  });
});

describe("CURRENT_BUILD_VERSION", () => {
  it("matches the latest BuildV* variant in the discriminated union", () => {
    expect(CURRENT_BUILD_VERSION).toBe(6);
  });
});
