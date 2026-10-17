import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import { Build } from "../build-schema.js";
import { loadSavedBuild } from "./load.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const HANDGUARD_ID = "5ae30db85acfc408fb139a05";
const COLT_A2_GRIP = "55d4b9964bdc2d1d4e8b456e";
const HANDGUARD = "mod_reciever/mod_handguard";
const ELCAN = "57ac965c24597706be5f975c";
const AIMPOINT_MOUNT = "58d39d3d86f77445bb794ae7";
const PEQ15 = "544909bb4bdc2d6f028b4577";
const KAC_RIS = "55f84c3c4bdc2d5f408b4576";
const GONE_WEAPON = "111111111111111111111111";
const BOGUS = "000000000000000000000000";
const CREATED = "2026-01-01T00:00:00.000Z";

const parse = (raw: unknown) => Build.parse(raw);

describe("loadSavedBuild", () => {
  it("v1: a handguard the legacy tree places under an empty upper is orphaned, not hidden", async () => {
    const { snapshot } = await fixtureSnapshot();
    const v1 = parse({ version: 1, weaponId: M4A1, modIds: [HANDGUARD_ID], createdAt: CREATED });
    expect(loadSavedBuild(v1, snapshot)).toEqual({
      version: 6,
      weaponId: M4A1,
      attachments: {},
      orphaned: [HANDGUARD_ID],
      createdAt: CREATED,
    });
  });

  it("v1: places what fits", async () => {
    const { snapshot } = await fixtureSnapshot();
    const v1 = parse({
      version: 1,
      weaponId: M4A1,
      modIds: [M4A1_UPPER, HANDGUARD_ID],
      createdAt: CREATED,
    });
    expect(loadSavedBuild(v1, snapshot).attachments).toEqual({
      mod_reciever: M4A1_UPPER,
      [HANDGUARD]: HANDGUARD_ID,
    });
  });

  it("v1: a later mod for a slot already taken never overwrites it; with no free slot it is orphaned", async () => {
    const { snapshot } = await fixtureSnapshot();
    // The Aimpoint mount also fits the upper's scope slot. It used to overwrite the ELCAN there,
    // and the ELCAN was then neither placed nor orphaned.
    const v1 = parse({
      version: 1,
      weaponId: M4A1,
      modIds: [M4A1_UPPER, ELCAN, AIMPOINT_MOUNT],
      createdAt: CREATED,
    });
    const loaded = loadSavedBuild(v1, snapshot);
    expect(loaded.attachments).toEqual({
      mod_reciever: M4A1_UPPER,
      "mod_reciever/mod_scope": ELCAN,
    });
    expect(loaded.orphaned).toEqual([AIMPOINT_MOUNT]);
  });

  it("v1: each copy of a repeated id takes the next free slot that allows it", async () => {
    // A preset can fit the same part twice; v1 used to keep only the first copy.
    const { snapshot } = await fixtureSnapshot();
    const v1 = parse({
      version: 1,
      weaponId: M4A1,
      modIds: [M4A1_UPPER, KAC_RIS, PEQ15, PEQ15],
      createdAt: CREATED,
    });
    const loaded = loadSavedBuild(v1, snapshot);
    expect(loaded.attachments).toEqual({
      mod_reciever: M4A1_UPPER,
      [HANDGUARD]: KAC_RIS,
      [`${HANDGUARD}/mod_tactical001`]: PEQ15,
      [`${HANDGUARD}/mod_tactical002`]: PEQ15,
    });
    expect(loaded.orphaned).toEqual([]);
  });

  it("v1 on a weapon the game data no longer holds: every mod id is kept as an orphan", async () => {
    const { snapshot } = await fixtureSnapshot();
    const v1 = parse({
      version: 1,
      weaponId: GONE_WEAPON,
      modIds: [HANDGUARD_ID, HANDGUARD_ID, M4A1_UPPER],
      createdAt: CREATED,
    });
    expect(loadSavedBuild(v1, snapshot)).toMatchObject({
      version: 6,
      attachments: {},
      orphaned: [HANDGUARD_ID, M4A1_UPPER],
    });
  });

  it("v2: steps up to v6 and orphans what is not on the weapon", async () => {
    const { snapshot } = await fixtureSnapshot();
    const v2 = parse({
      version: 2,
      weaponId: M4A1,
      attachments: { [HANDGUARD]: HANDGUARD_ID, mod_pistol_grip: COLT_A2_GRIP, mod_stock: BOGUS },
      orphaned: [BOGUS],
      createdAt: CREATED,
    });
    expect(loadSavedBuild(v2, snapshot)).toEqual({
      version: 6,
      weaponId: M4A1,
      attachments: { mod_pistol_grip: COLT_A2_GRIP },
      orphaned: [BOGUS, HANDGUARD_ID],
      createdAt: CREATED,
    });
  });

  it("v4: upgrades the profile's quest names on the way", async () => {
    const { snapshot } = await fixtureSnapshot();
    const v4 = parse({
      version: 4,
      weaponId: M4A1,
      attachments: {},
      orphaned: [],
      createdAt: CREATED,
      name: "Old",
      profileSnapshot: {
        mode: "advanced",
        traders: {
          prapor: 1,
          therapist: 1,
          skier: 1,
          peacekeeper: 1,
          mechanic: 1,
          ragman: 1,
          jaeger: 1,
        },
        flea: false,
        completedQuests: ["gunsmith-part-1"],
      },
    });
    const loaded = loadSavedBuild(v4, snapshot);
    expect(loaded.version).toBe(6);
    expect(loaded.name).toBe("Old");
    expect(loaded.profileSnapshot?.completedQuests).toEqual(["gunsmith-master-part-1"]);
  });

  it("v6 on a weapon the game data no longer holds keeps known parts where saved, orphans the rest", async () => {
    const { snapshot } = await fixtureSnapshot();
    const v6 = parse({
      version: 6,
      weaponId: GONE_WEAPON,
      attachments: { [HANDGUARD]: HANDGUARD_ID, mod_stock: BOGUS, mod_pistol_grip: BOGUS },
      orphaned: [],
      createdAt: CREATED,
    });
    expect(loadSavedBuild(v6, snapshot)).toEqual({
      ...v6,
      attachments: { [HANDGUARD]: HANDGUARD_ID },
      orphaned: [BOGUS],
    });
  });
});
