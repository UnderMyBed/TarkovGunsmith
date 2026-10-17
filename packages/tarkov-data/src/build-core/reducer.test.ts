import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import { tinyTree } from "../__test-utils__/tiny-tree.js";
import { conflictsWith, type ConflictFields } from "../conflicts.js";
import { DEFAULT_PROFILE } from "../build-schema.js";
import { snapshotPartsById, snapshotWeaponTree } from "../snapshot/views.js";
import { applyBuildAction, toBuildPayload, type BuildContext, type BuildState } from "./reducer.js";
import { resolveBuild } from "./resolve.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PM = "5448bd6b4bdc2dfc2f8b4569";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const ADAR_UPPER = "5c0e2f26d174af02a9625114";
const HANDGUARD_ID = "5ae30db85acfc408fb139a05";
const COLT_A2_GRIP = "55d4b9964bdc2d1d4e8b456e";
const STANAG_MAG = "55d4887d4bdc2d962f8b4570";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const A2_20 = "68a63ac58e1fe612970728f2";
const M4A1_FRONT_SIGHT_GAS_BLOCK = "5ae30e795acfc408fb139a0b";
const COLT_A2_FLASH_HIDER = "544a38634bdc2d58388b4568";
const AX15_4 = "63f4ba71f31d4a33b87bd046";
const BOGUS = "000000000000000000000000";

const BARREL = "mod_reciever/mod_barrel";
const GAS_BLOCK = `${BARREL}/mod_gas_block`;
const MUZZLE = `${BARREL}/mod_muzzle`;
const HANDGUARD = "mod_reciever/mod_handguard";

async function m4a1(): Promise<{ ctx: BuildContext; carbine: Record<string, string> }> {
  const { snapshot } = await fixtureSnapshot();
  return {
    ctx: { tree: snapshotWeaponTree(snapshot, M4A1), parts: snapshotPartsById(snapshot) },
    carbine: { ...snapshot.presets[M4A1]![0]!.attachments },
  };
}

const state = (attachments: Record<string, string>, orphaned: string[] = []): BuildState => ({
  weaponId: M4A1,
  attachments,
  orphaned,
});

describe("applyBuildAction — load", () => {
  it("moves a handguard saved with no upper to orphaned, keeping earlier orphans once", async () => {
    const { ctx } = await m4a1();
    const saved = state({ [HANDGUARD]: HANDGUARD_ID, mod_pistol_grip: COLT_A2_GRIP }, [
      HANDGUARD_ID,
      BOGUS,
    ]);
    const loaded = applyBuildAction(state({}), { type: "load", build: saved }, ctx);
    expect(loaded).toEqual(state({ mod_pistol_grip: COLT_A2_GRIP }, [HANDGUARD_ID, BOGUS]));
  });

  it("orphans an id the game data does not hold and a part its slot does not take", async () => {
    const { ctx } = await m4a1();
    const saved = state({ mod_stock: BOGUS, mod_pistol_grip: STANAG_MAG });
    expect(applyBuildAction(state({}), { type: "load", build: saved }, ctx)).toEqual(
      state({}, [STANAG_MAG, BOGUS]),
    );
  });

  it("refuses to load without the weapon's tree, or against another weapon's", async () => {
    const { ctx } = await m4a1();
    const pm = { ...state({}), weaponId: PM };
    expect(() => applyBuildAction(state({}), { type: "load", build: state({}) }, null)).toThrow(
      /No slot tree for weapon/,
    );
    expect(() => applyBuildAction(pm, { type: "load", build: pm }, ctx)).toThrow(PM);
  });
});

describe("applyBuildAction — attach", () => {
  it("emptying the upper takes the handguard with it (the #219 report)", async () => {
    const { ctx } = await m4a1();
    let s = applyBuildAction(
      state({}),
      { type: "attach", path: "mod_reciever", itemId: M4A1_UPPER },
      ctx,
    );
    s = applyBuildAction(s, { type: "attach", path: HANDGUARD, itemId: HANDGUARD_ID }, ctx);
    expect(s.attachments).toEqual({ mod_reciever: M4A1_UPPER, [HANDGUARD]: HANDGUARD_ID });
    s = applyBuildAction(s, { type: "attach", path: "mod_reciever", itemId: null }, ctx);
    expect(s).toEqual(state({}));
  });

  it("re-selecting the fitted part keeps everything beneath it", async () => {
    const { ctx, carbine } = await m4a1();
    const s = applyBuildAction(
      state(carbine),
      { type: "attach", path: "mod_reciever", itemId: M4A1_UPPER },
      ctx,
    );
    expect(s.attachments).toEqual(carbine);
  });

  it("swapping the upper carries over every part the new upper's slots take", async () => {
    const { ctx, carbine } = await m4a1();
    const s = applyBuildAction(
      state(carbine),
      { type: "attach", path: "mod_reciever", itemId: ADAR_UPPER },
      ctx,
    );
    expect(s.attachments).toEqual({ ...carbine, mod_reciever: ADAR_UPPER });
    expect(resolveBuild(ctx.tree, s.attachments, ctx.parts).conflicts).toEqual([]);
  });

  it("carries the gas block and muzzle onto an A2 barrel when nothing blocks them", async () => {
    const { ctx } = await m4a1();
    const start = {
      mod_reciever: M4A1_UPPER,
      [BARREL]: BARREL_10_3,
      [GAS_BLOCK]: M4A1_FRONT_SIGHT_GAS_BLOCK,
      [MUZZLE]: COLT_A2_FLASH_HIDER,
    };
    const s = applyBuildAction(state(start), { type: "attach", path: BARREL, itemId: A2_20 }, ctx);
    expect(s.attachments).toEqual({ ...start, [BARREL]: A2_20 });
  });

  it('drops what an AX-15 4" handguard blocks on the A2, so the clash is prevented (#240)', async () => {
    const { ctx } = await m4a1();
    const start = {
      mod_reciever: M4A1_UPPER,
      [BARREL]: BARREL_10_3,
      [GAS_BLOCK]: M4A1_FRONT_SIGHT_GAS_BLOCK,
      [MUZZLE]: COLT_A2_FLASH_HIDER,
      [HANDGUARD]: AX15_4,
    };
    // Kept blindly, the gas block would sit in a slot the handguard blocks.
    expect(
      conflictsWith(
        { tree: ctx.tree, attachments: { ...start, [BARREL]: A2_20 }, parts: ctx.parts },
        { itemId: AX15_4, path: HANDGUARD },
      ),
    ).not.toEqual([]);

    const s = applyBuildAction(state(start), { type: "attach", path: BARREL, itemId: A2_20 }, ctx);
    expect(s.attachments).toEqual({
      mod_reciever: M4A1_UPPER,
      [BARREL]: A2_20,
      [HANDGUARD]: AX15_4,
    });
    expect(resolveBuild(ctx.tree, s.attachments, ctx.parts).conflicts).toEqual([]);
    expect(s.orphaned).toEqual([]);
  });

  it("refuses a path the build does not have, and a part its slot does not take", async () => {
    const { ctx } = await m4a1();
    expect(() =>
      applyBuildAction(state({}), { type: "attach", path: HANDGUARD, itemId: HANDGUARD_ID }, ctx),
    ).toThrow(`No slot at ${HANDGUARD}`);
    expect(() =>
      applyBuildAction(
        state({}),
        { type: "attach", path: "mod_pistol_grip", itemId: STANAG_MAG },
        ctx,
      ),
    ).toThrow(STANAG_MAG);
  });

  it("does not carry a part over beneath itself", () => {
    const tree = tinyTree("w", [
      {
        nameId: "a",
        items: [
          ["p", [{ nameId: "b", items: ["p2"] }]],
          ["p2", [{ nameId: "b", items: ["p2"] }]],
        ],
      },
    ]);
    const none: ConflictFields = { conflictingItems: [], conflictingSlotIds: [] };
    const ctx = {
      tree,
      parts: new Map([
        ["p", none],
        ["p2", none],
      ]),
    };
    const s = applyBuildAction(
      { weaponId: "w", attachments: { a: "p", "a/b": "p2" }, orphaned: [] },
      { type: "attach", path: "a", itemId: "p2" },
      ctx,
    );
    expect(s.attachments).toEqual({ a: "p2" });
  });
});

describe("applyBuildAction — whole-build changes", () => {
  it("a new weapon starts from its seed, and the old build's orphans go with it", () => {
    expect(
      applyBuildAction(
        state({ mod_pistol_grip: COLT_A2_GRIP }, [BOGUS]),
        { type: "changeWeapon", weaponId: PM, seed: { mod_magazine: STANAG_MAG } },
        null,
      ),
    ).toEqual({ weaponId: PM, attachments: { mod_magazine: STANAG_MAG }, orphaned: [] });
  });

  it("dismissing orphans clears only them", () => {
    expect(
      applyBuildAction(
        state({ mod_pistol_grip: COLT_A2_GRIP }, [BOGUS]),
        { type: "dismissOrphaned" },
        null,
      ),
    ).toEqual(state({ mod_pistol_grip: COLT_A2_GRIP }));
  });

  it("a preset or an accepted optimization replaces the parts; anything not on the weapon is orphaned", async () => {
    const { ctx, carbine } = await m4a1();
    expect(
      applyBuildAction(state({}, [BOGUS]), { type: "applyPreset", attachments: carbine }, ctx),
    ).toEqual(state(carbine, [BOGUS]));
    expect(
      applyBuildAction(
        state(carbine),
        {
          type: "acceptOptimized",
          attachments: { mod_pistol_grip: COLT_A2_GRIP, [HANDGUARD]: HANDGUARD_ID },
        },
        ctx,
      ),
    ).toEqual(state({ mod_pistol_grip: COLT_A2_GRIP }, [HANDGUARD_ID]));
  });
});

describe("applyBuildAction — no phantom ever survives an edit", () => {
  it("holds over a seeded random walk of attaches on the M4A1", async () => {
    const { ctx, carbine } = await m4a1();
    // A small deterministic LCG: the walk is the same on every run.
    let seed = 219;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    let s = state(carbine);
    for (let step = 0; step < 400; step++) {
      const slots = resolveBuild(ctx.tree, s.attachments, ctx.parts);
      const shown = [...slots.placed.map((p) => p.slot), ...slots.missingRequired];
      const slot = shown[next(shown.length)]!;
      const options = [...slot.allowedItemIds];
      const pick = next(options.length + 1);
      s = applyBuildAction(
        s,
        {
          type: "attach",
          path: slot.path,
          itemId: pick === options.length ? null : options[pick]!,
        },
        ctx,
      );
      const r = resolveBuild(ctx.tree, s.attachments, ctx.parts);
      expect(r.orphaned).toEqual([]);
      expect(r.attachments).toEqual(s.attachments);
      expect(s.orphaned).toEqual([]);
    }
  });
});

describe("toBuildPayload", () => {
  it("writes a current-version build, trimming the name and leaving blanks out", () => {
    expect(
      toBuildPayload(state({ mod_pistol_grip: COLT_A2_GRIP }, [BOGUS]), {
        name: "  Budget M4  ",
        description: "   ",
        profile: DEFAULT_PROFILE,
        createdAt: "2026-10-16T00:00:00.000Z",
      }),
    ).toEqual({
      version: 6,
      weaponId: M4A1,
      attachments: { mod_pistol_grip: COLT_A2_GRIP },
      orphaned: [BOGUS],
      createdAt: "2026-10-16T00:00:00.000Z",
      name: "Budget M4",
      profileSnapshot: DEFAULT_PROFILE,
    });
  });

  it("stamps the time of writing, with no name, description or profile", () => {
    const payload = toBuildPayload(state({}), { description: "Notes" });
    const { createdAt, ...rest } = payload;
    expect(rest).toEqual({
      version: 6,
      weaponId: M4A1,
      attachments: {},
      orphaned: [],
      description: "Notes",
    });
    expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
    expect(toBuildPayload(state({})).name).toBeUndefined();
  });
});
