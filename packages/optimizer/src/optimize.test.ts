import { describe, it, expect, vi, afterEach } from "vitest";
import {
  adaptMod,
  resolveBuild,
  partsById,
  type AttachablePart,
  type PlayerProfile,
  type WeaponTree,
} from "@tarkov/data";
import { weaponSpec, type BallisticWeapon } from "@tarkov/ballistics";
import { optimize } from "./optimize.js";
import {
  SMALL_WEAPON,
  SMALL_WEAPON_ITEM,
  SMALL_WEAPON_PRICE,
  SMALL_MODS,
  SMALL_TREE,
} from "./__fixtures__/small-weapon.js";
import { tinyTree, type SlotSpec } from "./__fixtures__/tree.js";
import type { OptimizationInput, Objective } from "./types.js";

interface PartSpec {
  name?: string;
  recoil?: number;
  ergonomics?: number;
  weight?: number;
  accuracy?: number;
  /** Roubles on the flea; `null` is a listing with no known price; `"unsold"` is no offer. */
  price?: number | null | "unsold";
  barrel?: { centerOfImpact: number; deviationMax: number };
  conflicts?: string[];
  blocks?: string[];
}

function part(id: string, spec: PartSpec = {}): AttachablePart {
  const modifiers = {
    ergonomics: spec.ergonomics ?? 0,
    recoilModifier: spec.recoil ?? 0,
    accuracyModifier: spec.accuracy ?? 0,
    velocity: 0,
  };
  const price = spec.price === undefined ? 1000 : spec.price;
  return {
    id,
    name: spec.name ?? id,
    shortName: spec.name ?? id,
    iconLink: `https://example.com/${id}.png`,
    weight: spec.weight ?? 0.1,
    types: ["mods"],
    minLevelForFlea: null,
    properties:
      spec.barrel === undefined
        ? { propertiesType: "ItemPropertiesWeaponMod", ...modifiers }
        : { propertiesType: "ItemPropertiesBarrel", ...modifiers, ...spec.barrel },
    conflictingItems: spec.conflicts ?? [],
    conflictingSlotIds: spec.blocks ?? [],
    buyFor:
      price === "unsold"
        ? []
        : [
            {
              priceRUB: price,
              currency: "RUB",
              vendor: {
                __typename: "FleaMarket",
                normalizedName: "flea-market",
                minPlayerLevel: 15,
              },
            },
          ],
  };
}

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
  // The fixtures' flea offers carry minPlayerLevel: 15.
  level: 15,
};
const fleaOff: PlayerProfile = { ...flea, flea: false };

const tree = (slots: readonly SlotSpec[]): WeaponTree => ({
  ...tinyTree(SMALL_WEAPON.id, slots),
  weaponName: SMALL_WEAPON.name,
});

function run(
  overrides: Partial<Omit<OptimizationInput, "constraints">> & {
    budgetRub?: number;
    pins?: Record<string, string | null>;
    profile?: PlayerProfile | null;
    objective?: Objective;
  } = {},
) {
  const { budgetRub, pins, profile, ...rest } = overrides;
  return optimize({
    weapon: SMALL_WEAPON,
    weaponItem: SMALL_WEAPON_ITEM,
    slotTree: SMALL_TREE,
    parts: SMALL_MODS,
    objective: "min-recoil",
    ...rest,
    constraints: {
      profile: profile === undefined ? flea : profile,
      pinnedSlots: new Map(Object.entries(pins ?? {})),
      ...(budgetRub === undefined ? {} : { budgetRub }),
    },
  });
}

function ok(result: ReturnType<typeof optimize>) {
  if (!result.ok) throw new Error(`expected a build, got ${result.reason}`);
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("optimize — the best build", () => {
  it("finds the min-recoil optimum, with its stats and an empty pin report", () => {
    const result = ok(run());
    expect(result.build).toEqual({
      version: 6,
      weaponId: "weap1",
      attachments: { muzzle: "muzzle_brake", grip: "grip_vertical", stock: "stock_standard" },
      orphaned: [],
      createdAt: "1970-01-01T00:00:00.000Z",
    });
    const placed = SMALL_MODS.filter((m) => m.id !== "muzzle_silencer").map(adaptMod);
    expect(result.stats).toEqual(weaponSpec(SMALL_WEAPON, placed));
    expect(result.pins).toEqual({ honoured: [], dropped: [] });
  });

  it("optimizes each objective", () => {
    expect(ok(run({ objective: "max-ergonomics" })).build.attachments).toEqual({
      muzzle: "muzzle_silencer",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
    // Every part adds weight, and no slot is required.
    expect(ok(run({ objective: "min-weight" })).build.attachments).toEqual({});
  });

  it("fills a required slot even when the part makes the build worse", () => {
    const slotTree = tree([
      { nameId: "muzzle", items: ["muzzle_brake"] },
      { nameId: "stock", required: true, items: ["stock_standard"] },
    ]);
    expect(ok(run({ slotTree, objective: "min-weight" })).build.attachments).toEqual({
      stock: "stock_standard",
    });
  });

  it("never returns parts that clash, by item or by blocked slot", () => {
    // Recorded on one side only, as upstream does: the grip lists the brake.
    const clash = SMALL_MODS.map((m) =>
      m.id === "grip_vertical" ? { ...m, conflictingItems: ["muzzle_brake"] } : m,
    );
    // brake + stock and silencer + grip + stock both reach −0.18; brake + stock is cheaper.
    expect(ok(run({ parts: clash })).build.attachments).toEqual({
      muzzle: "muzzle_brake",
      stock: "stock_standard",
    });
    const blocking = SMALL_MODS.map((m) =>
      m.id === "muzzle_silencer" ? { ...m, conflictingSlotIds: ["weap1:grip"] } : m,
    );
    const result = ok(run({ parts: blocking, objective: "max-ergonomics" }));
    expect(result.build.attachments).toEqual({
      muzzle: "muzzle_brake",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
    expect(
      resolveBuild(SMALL_TREE, result.build.attachments, partsById(blocking)).conflicts,
    ).toEqual([]);
  });

  it("returns the bare gun when it has no slots", () => {
    expect(ok(run({ slotTree: tree([]) })).build.attachments).toEqual({});
  });

  it("solves a part that more than one slot takes once, and may use it in each", () => {
    const shared = tree([
      { nameId: "top", items: ["rail"] },
      { nameId: "side", items: ["rail"] },
    ]);
    expect(
      ok(run({ slotTree: shared, parts: [part("rail", { recoil: -0.01 })] })).build.attachments,
    ).toEqual({ top: "rail", side: "rail" });
  });

  it("breaks a tie by price, then by fewer parts", () => {
    const parts = [
      part("a", { recoil: -0.12, price: 2000 }),
      part("b", { recoil: -0.12, price: 1000 }),
      part("cap", { recoil: 0, price: 0 }),
    ];
    const slotTree = tree([
      { nameId: "muzzle", items: ["a", "b"] },
      { nameId: "cap", items: ["cap"] },
    ]);
    expect(ok(run({ parts, slotTree })).build.attachments).toEqual({ muzzle: "b" });
  });

  it("stays inside the budget, which covers the gun and every part", () => {
    expect(ok(run({ budgetRub: SMALL_WEAPON_PRICE + 2000 })).build.attachments).toEqual({
      muzzle: "muzzle_brake",
    });
    expect(ok(run({ budgetRub: SMALL_WEAPON_PRICE + 2400 })).build.attachments).toEqual({
      muzzle: "muzzle_brake",
      grip: "grip_vertical",
    });
  });

  it("reports each candidate build it checks, counted across the whole run, and returns the same", () => {
    // A clash makes the search split, so it checks more than one candidate.
    const input = {
      parts: SMALL_MODS.map((m) =>
        m.id === "grip_vertical" ? { ...m, conflictingItems: ["muzzle_brake"] } : m,
      ),
    };
    const seen: number[] = [];
    const reported = run({ ...input, onProgress: (p) => seen.push(p.nodes) });
    expect(reported).toEqual(run(input));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toEqual(seen.map((_, i) => i + 1));
    // A run that fails searches again to say why; those searches count on from the first.
    const failing: number[] = [];
    run({ budgetRub: 1, profile: null, onProgress: (p) => failing.push(p.nodes) });
    expect(failing).toEqual(failing.map((_, i) => i + 1));
  });
});

describe("optimize — max-accuracy", () => {
  const parts = [
    part("b1", { barrel: { centerOfImpact: 0.05, deviationMax: 50 } }),
    part("b2", { barrel: { centerOfImpact: 0.02, deviationMax: 0 }, accuracy: -0.1 }),
    part("b3", { barrel: { centerOfImpact: 0.03, deviationMax: 120 } }),
    part("m1", { accuracy: 0.1 }),
    part("m2", { accuracy: -0.05 }),
    part("m3", { accuracy: 0.2, conflicts: ["b3"] }),
  ];
  const slotTree = tree([
    { nameId: "barrel", required: true, items: ["b1", "b2", "b3"] },
    { nameId: "muzzle", items: ["m1", "m2", "m3"] },
  ]);

  it("returns the build with the lowest MOA of every build there is", () => {
    const byId = partsById(parts);
    let best = Number.POSITIVE_INFINITY;
    for (const barrel of ["b1", "b2", "b3"]) {
      for (const muzzle of [null, "m1", "m2", "m3"]) {
        if (barrel === "b3" && muzzle === "m3") continue;
        const ids = muzzle === null ? [barrel] : [barrel, muzzle];
        const spec = weaponSpec(
          SMALL_WEAPON,
          ids.map((id) => adaptMod(byId.get(id)!)),
        );
        best = Math.min(best, spec.accuracy);
      }
    }
    const result = ok(run({ parts, slotTree, objective: "max-accuracy" }));
    expect(result.stats.accuracy).toBeCloseTo(best, 12);
  });

  it("takes the cheapest build whose MOA is 0 whatever its modifiers", () => {
    const weapon: BallisticWeapon = { ...SMALL_WEAPON, centerOfImpact: 0 };
    const zeroParts = [
      part("z1", { barrel: { centerOfImpact: 0, deviationMax: 50 }, price: 5000 }),
      part("z2", { barrel: { centerOfImpact: 0, deviationMax: 60 }, price: 3000 }),
      part("b", { barrel: { centerOfImpact: 0.02, deviationMax: 50 }, price: 100 }),
      part("m1", { accuracy: 0.5, price: 100 }),
    ];
    const zeroTree = tree([
      { nameId: "barrel", required: true, items: ["z1", "z2", "b"] },
      { nameId: "muzzle", items: ["m1"] },
    ]);
    const result = ok(
      run({ weapon, parts: zeroParts, slotTree: zeroTree, objective: "max-accuracy" }),
    );
    expect(result.build.attachments).toEqual({ barrel: "z2" });
    expect(result.stats.accuracy).toBe(0);
  });

  it("throws when a build could hold two parts that set the dispersion", () => {
    const twoBarrels = tree([
      { nameId: "barrel", required: true, items: ["b1"] },
      { nameId: "handguard", items: [["hg", [{ nameId: "barrel", items: ["b2"] }]]] },
    ]);
    expect(() =>
      run({ parts: [...parts, part("hg")], slotTree: twoBarrels, objective: "max-accuracy" }),
    ).toThrow("two parts set the dispersion of one build: b1 and b2");
  });
});

describe("optimize — what it refuses", () => {
  it("refuses a gun the profile can't get, naming why", () => {
    const refusal = { ok: false, reason: "weapon-unavailable" };
    // Prapor sells it at LL4; the profile is LL1.
    const highLevel = {
      ...SMALL_WEAPON_ITEM,
      buyFor: SMALL_WEAPON_ITEM.buyFor!.map((e) =>
        e.vendor.__typename === "TraderOffer"
          ? { ...e, vendor: { ...e.vendor, minTraderLevel: 4 } }
          : e,
      ),
    };
    const gated = { ...refusal, message: "You can't get the TR on this profile." };
    expect(run({ weaponItem: highLevel })).toEqual(gated);
    expect(run({ weaponItem: highLevel, budgetRub: 50_000 })).toEqual(gated);
    // Nothing sells it: no profile, nor theorycraft, reaches it.
    const unsold = { ...SMALL_WEAPON_ITEM, buyFor: [] };
    const nobody = { ...refusal, message: "No trader or flea listing sells the TR." };
    expect(run({ weaponItem: unsold })).toEqual(nobody);
    expect(run({ weaponItem: unsold, profile: null })).toEqual(nobody);
    // A record whose offers upstream publishes as null, and a preset with none.
    const bare = { ...SMALL_WEAPON_ITEM, buyFor: null };
    expect(run({ weaponItem: bare, presets: [{ id: "pa", attachments: {} }] })).toEqual(nobody);
    // Only Ref sells it, by barter: no trader level a profile holds reaches him.
    const refOnly = {
      ...SMALL_WEAPON_ITEM,
      buyFor: [
        {
          priceRUB: 50_000,
          currency: "RUB",
          vendor: {
            __typename: "TraderBarter" as const,
            normalizedName: "ref",
            minTraderLevel: 1,
            taskUnlock: null,
            trader: { normalizedName: "ref" },
            barterId: "b1",
            offeredCount: 1,
            requiredItems: [],
            costUnavailableReason: null,
          },
        },
      ],
    };
    expect(run({ weaponItem: refOnly })).toEqual({
      ...refusal,
      message: "Only Ref sells the TR, by barter, and no trader level you can set reaches Ref.",
    });
    expect(run({ weaponItem: refOnly, profile: null }).ok).toBe(true);
    const refCash = {
      ...SMALL_WEAPON_ITEM,
      buyFor: SMALL_WEAPON_ITEM.buyFor!.map((e) => ({
        ...e,
        vendor: { ...e.vendor, normalizedName: "ref", trader: { normalizedName: "ref" } },
      })),
    };
    expect(run({ weaponItem: refCash })).toMatchObject({
      message: "Only Ref sells the TR, and no trader level you can set reaches Ref.",
    });
    // Ref sells it for cash as well as by barter, and Fence sells it too.
    const refBarter = refOnly.buyFor[0]!;
    expect(
      run({ weaponItem: { ...SMALL_WEAPON_ITEM, buyFor: [refBarter, ...refCash.buyFor] } }),
    ).toMatchObject({
      message: "Only Ref sells the TR, and no trader level you can set reaches Ref.",
    });
    const fence = {
      ...refBarter,
      vendor: {
        ...refBarter.vendor,
        normalizedName: "fence",
        trader: { normalizedName: "fence" },
        barterId: "b2",
      },
    };
    expect(run({ weaponItem: { ...SMALL_WEAPON_ITEM, buyFor: [refBarter, fence] } })).toMatchObject(
      {
        message:
          "Only Ref and Fence sell the TR, by barter, and no trader level you can set reaches them.",
      },
    );
    // Only a preset sells it, at a level the profile lacks: the preset's offer is the cause.
    expect(
      run({
        weaponItem: unsold,
        presets: [{ id: "pa", attachments: {}, buyFor: highLevel.buyFor }],
      }),
    ).toEqual(gated);
    // The flea is the only way, and nobody is listing it.
    const unlisted = {
      ...SMALL_WEAPON_ITEM,
      buyFor: [
        {
          priceRUB: null,
          currency: "RUB",
          unlisted: true as const,
          vendor: {
            __typename: "FleaMarket" as const,
            normalizedName: "flea-market",
            minPlayerLevel: 1,
          },
        },
      ],
    };
    expect(run({ weaponItem: unlisted })).toEqual({
      ...refusal,
      message: "Nobody is listing the TR on the flea, and no trader you can reach sells it.",
    });
    // Theorycraft: a flea-only gun the flea may not trade.
    const noFlea = {
      ...SMALL_WEAPON_ITEM,
      types: [...SMALL_WEAPON_ITEM.types, "noFlea"],
      buyFor: [{ ...unlisted.buyFor[0]!, priceRUB: 1000, unlisted: undefined }],
    };
    expect(run({ weaponItem: noFlea, profile: null })).toEqual({
      ...refusal,
      message: "You can't get the TR.",
    });
  });

  it("refuses a budget below the cheapest gun, naming its price", () => {
    expect(run({ budgetRub: 9_999 })).toEqual({
      ok: false,
      reason: "infeasible-budget",
      cause: "over-budget",
      message: "The cheapest TR you can get costs ₽10,000, over the ₽9,999 budget.",
    });
  });

  it("refuses a budget when no gun has a known price", () => {
    const unpriced = {
      ...SMALL_WEAPON_ITEM,
      buyFor: SMALL_WEAPON_ITEM.buyFor!.map((e) => ({ ...e, priceRUB: null })),
    };
    expect(run({ weaponItem: unpriced, budgetRub: 50_000 })).toEqual({
      ok: false,
      reason: "infeasible-budget",
      cause: "unpriced",
      message: "No TR you can get has a known price, so no build can be shown to fit a budget.",
    });
  });

  it("refuses pinned parts with no price the profile can pay, naming them", () => {
    expect(
      run({
        profile: fleaOff,
        budgetRub: 50_000,
        pins: { muzzle: "muzzle_brake", grip: "grip_vertical", stock: null, other: "ghost" },
      }),
    ).toEqual({
      ok: false,
      reason: "pinned-unpriced",
      itemIds: ["muzzle_brake", "grip_vertical"],
      message:
        "No price you can pay is known for Brake, Vertical grip. Unpin them or clear the budget.",
    });
    expect(
      run({ profile: fleaOff, budgetRub: 50_000, pins: { muzzle: "muzzle_brake" } }),
    ).toMatchObject({ message: /Unpin it or clear the budget/ });
  });

  it("lets the search keep a pin with no payable price that a build can leave off", () => {
    // The pin holds only where handguard/foregrip exists: hg2 has no foregrip slot.
    const parts = [
      part("hg1", { recoil: -0.05 }),
      part("hg2", { recoil: -0.04 }),
      part("fg", { recoil: -0.01, price: null }),
    ];
    const slotTree = tree([
      { nameId: "handguard", items: [["hg1", [{ nameId: "foregrip", items: ["fg"] }]], "hg2"] },
    ]);
    const pins = { "handguard/foregrip": "fg" };
    expect(ok(run({ parts, slotTree, pins, budgetRub: 50_000 })).build.attachments).toEqual({
      handguard: "hg2",
    });
    expect(ok(run({ parts, slotTree, pins })).build.attachments).toEqual({
      handguard: "hg1",
      "handguard/foregrip": "fg",
    });
    // A pin the slot cannot take is dropped, not refused.
    expect(
      ok(run({ profile: fleaOff, budgetRub: 50_000, pins: { grip: "muzzle_brake" } })).pins.dropped,
    ).toEqual([{ path: "grip", itemId: "muzzle_brake", reason: "not-allowed" }]);
  });

  it("runs a budget with a pinned part it can price, or one a bought preset supplies", () => {
    expect(
      ok(run({ budgetRub: 50_000, pins: { muzzle: "muzzle_brake" } })).build.attachments,
    ).toMatchObject({ muzzle: "muzzle_brake" });
    const preset = { id: "p", normalizedName: "tr-default" };
    const result = ok(
      run({
        profile: fleaOff,
        weaponItem: {
          ...SMALL_WEAPON_ITEM,
          buyFor: [{ ...SMALL_WEAPON_ITEM.buyFor![0]!, priceRUB: 12_000, preset }],
        },
        presets: [{ id: "p", attachments: { muzzle: "muzzle_brake" } }],
        budgetRub: 12_000,
        pins: { muzzle: "muzzle_brake" },
      }),
    );
    expect(result.build.attachments).toEqual({ muzzle: "muzzle_brake" });
  });

  it("returns timeout when the safety net elapses", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(10_000);
    expect(run()).toEqual({ ok: false, reason: "timeout" });
  });

  it("throws on a slot graph with a cycle", () => {
    const loop = tree([
      { nameId: "rail", items: [["loop", [{ nameId: "rail", items: ["loop"] }]]] },
    ]);
    expect(() => run({ parts: [part("loop")], slotTree: loop })).toThrow(
      "the slot graph has a cycle through loop",
    );
  });
});

describe("optimize — why no build exists", () => {
  const stockRequired = tree([
    { nameId: "muzzle", items: ["muzzle_brake", "muzzle_silencer"] },
    { nameId: "grip", items: ["grip_vertical"] },
    { nameId: "stock", required: true, items: ["stock_standard"] },
  ]);

  it("names the cheapest complete build when it is over budget", () => {
    expect(run({ slotTree: stockRequired, budgetRub: 11_000 })).toEqual({
      ok: false,
      reason: "infeasible-budget",
      cause: "over-budget",
      message: "The cheapest complete build costs ₽12,200, over the ₽11,000 budget.",
    });
    const unpricedStock = [...SMALL_MODS.slice(0, 3), part("stock_standard", { price: null })];
    expect(run({ slotTree: stockRequired, parts: unpricedStock, budgetRub: 50_000 })).toEqual({
      ok: false,
      reason: "infeasible-budget",
      cause: "unpriced",
      message:
        "No complete build has a known price on this profile, so none can be shown to fit a budget.",
    });
  });

  it("names the pin to drop when two pins clash", () => {
    const parts = SMALL_MODS.map((m) =>
      m.id === "grip_vertical" ? { ...m, conflictingItems: ["muzzle_brake"] } : m,
    );
    const pins = { muzzle: "muzzle_brake", grip: "grip_vertical", stock: "stock_standard" };
    // Either pin of the pair could go; the build that breaks the fewest breaks the brake's,
    // leaving the muzzle empty, the cheapest way.
    const clash = {
      ok: false,
      reason: "pin-conflict",
      paths: ["muzzle"],
      message: "No complete build keeps every pin. Unpin Brake and run it again.",
    };
    expect(run({ parts, pins })).toEqual(clash);
    // Upstream records a conflict on either part.
    const listedOnBrake = SMALL_MODS.map((m) =>
      m.id === "muzzle_brake" ? { ...m, conflictingItems: ["grip_vertical"] } : m,
    );
    expect(run({ parts: listedOnBrake, pins })).toEqual(clash);
    const { muzzle: _, ...rest } = pins;
    expect(ok(run({ parts, pins: rest })).build.attachments).toMatchObject(rest);
  });

  it("names every pin a build needs gone, when one alone is not enough", () => {
    const slotTree = tree(["a", "b", "c", "d"].map((s) => ({ nameId: s, items: [`${s}1`] })));
    const parts = [
      part("a1", { price: 100, conflicts: ["b1"] }),
      part("b1", { price: 200 }),
      part("c1", { price: 100, conflicts: ["d1"] }),
      part("d1", { price: 200 }),
    ];
    const pins = { a: "a1", b: "b1", c: "c1", d: "d1" };
    expect(run({ slotTree, parts, pins })).toEqual({
      ok: false,
      reason: "pin-conflict",
      paths: ["b", "d"],
      message: "No complete build keeps every pin. Unpin b1, d1 and run it again.",
    });
    expect(run({ slotTree, parts, pins: { a: "a1", c: "c1", d: "d1" } }).ok).toBe(false);
    expect(ok(run({ slotTree, parts, pins: { a: "a1", c: "c1" } })).build.attachments).toEqual({
      a: "a1",
      c: "c1",
    });
  });

  // #266 review (b, p2): the pinned part is the only filler of a required slot, and nobody
  // sells it; dropping every pin also dropped the part, which read as an empty required slot.
  it("keeps a pinned part nobody sells at its own path when it names the pins to drop", () => {
    const slotTree = tree([
      { nameId: "stock", required: true, items: ["s"] },
      { nameId: "muzzle", items: ["m1", "m2"] },
    ]);
    const parts = [
      part("s", { price: "unsold" }),
      part("m1", { price: 100, conflicts: ["s"] }),
      part("m2", { price: 100 }),
    ];
    expect(run({ slotTree, parts, pins: { stock: "s", muzzle: "m1" } })).toEqual({
      ok: false,
      reason: "pin-conflict",
      paths: ["muzzle"],
      message: "No complete build keeps every pin. Unpin m1 and run it again.",
    });
    // Unpinning the muzzle is enough.
    expect(ok(run({ slotTree, parts, pins: { stock: "s" } })).build.attachments).toEqual({
      stock: "s",
    });
  });

  it("names only the pin in the way, not the ones no build is stopped by", () => {
    const gripRequired = tree([
      { nameId: "muzzle", items: ["muzzle_brake", "muzzle_silencer"] },
      { nameId: "grip", required: true, items: ["grip_vertical"] },
      { nameId: "stock", items: ["stock_standard"] },
    ]);
    const parts = SMALL_MODS.map((m) =>
      m.id === "muzzle_silencer" ? { ...m, conflictingSlotIds: ["weap1:grip"] } : m,
    );
    expect(
      run({
        parts,
        slotTree: gripRequired,
        pins: { muzzle: "muzzle_silencer", stock: null, "stock/x": "ghost" },
      }),
    ).toEqual({
      ok: false,
      reason: "pin-conflict",
      paths: ["muzzle"],
      message: "No complete build keeps every pin. Unpin Silencer and run it again.",
    });
  });

  // #269 review: a pinned part nobody sells sits only at its own pin's path. Made available
  // everywhere, it filled required slots it could never fill, and pins took the blame for
  // what no unpinning fixes.
  describe("blames no pin when unpinning cannot help", () => {
    const unsold = (id: string) => part(id, { price: "unsold" });
    const sold = (id: string, conflicts?: string[]) =>
      part(id, { price: 100, ...(conflicts === undefined ? {} : { conflicts }) });
    const cases: {
      name: string;
      slots: SlotSpec[];
      parts: AttachablePart[];
      pins: Record<string, string | null>;
      reason: string;
      slotPath?: string;
    }[] = [
      {
        // #269 review a, P1 (b, A): the pinned part is also the only filler of a required slot.
        name: "the pinned part is the only filler of another, required slot",
        slots: [
          { nameId: "mount", required: true, items: ["x"] },
          { nameId: "tac", items: ["x", "t2"] },
        ],
        parts: [unsold("x"), sold("t2")],
        pins: { tac: "x" },
        reason: "required-slot",
        slotPath: "mount",
      },
      {
        // #269 review b, C: an empty pin alongside.
        name: "the same, with an empty pin alongside",
        slots: [
          { nameId: "stock", required: true, items: ["x"] },
          { nameId: "muzzle", items: ["x", "m2"] },
          { nameId: "sight", items: ["m2"] },
        ],
        parts: [unsold("x"), sold("m2")],
        pins: { muzzle: "x", sight: null },
        reason: "required-slot",
        slotPath: "stock",
      },
      {
        // #269 review a, P2: a stale pin, on a path no build has.
        name: "the pin is on a path no build has",
        slots: [
          { nameId: "mount", required: true, items: ["x"] },
          { nameId: "tac", items: ["t2"] },
        ],
        parts: [unsold("x"), sold("t2")],
        pins: { "gone/deep": "x" },
        reason: "required-slot",
        slotPath: "mount",
      },
      {
        // #269 review a, P3: every build has parts that clash, pinned or not.
        name: "every build clashes either way",
        slots: [
          { nameId: "q", required: true, items: ["y1", "x"] },
          { nameId: "r", required: true, items: ["r"] },
          { nameId: "tac", items: ["x", "t2"] },
        ],
        parts: [unsold("x"), sold("y1", ["r"]), sold("r"), sold("t2")],
        pins: { tac: "x" },
        reason: "no-valid-combinations",
      },
      {
        // #269 review a, P4: a required slot nothing fills, behind a clash.
        name: "a required slot nothing fills, with a clash elsewhere",
        slots: [
          { nameId: "mount", required: true, items: ["x"] },
          { nameId: "a", required: true, items: ["a1"] },
          { nameId: "b", required: true, items: ["b1"] },
          { nameId: "tac", items: ["x", "t2"] },
        ],
        parts: [unsold("x"), sold("a1", ["b1"]), sold("b1"), sold("t2")],
        pins: { tac: "x" },
        reason: "required-slot",
        slotPath: "mount",
      },
    ];
    for (const c of cases) {
      it(c.name, () => {
        const slotTree = tree(c.slots);
        const pinned = run({ slotTree, parts: c.parts, pins: c.pins });
        expect(pinned).toMatchObject({
          ok: false,
          reason: c.reason,
          ...(c.slotPath === undefined ? {} : { slotPath: c.slotPath }),
        });
        // Unpinning everything changes nothing: the pins were never the cause.
        expect(run({ slotTree, parts: c.parts })).toEqual(pinned);
      });
    }
  });

  it("names a required slot nothing obtainable fills", () => {
    const unsoldStock = [...SMALL_MODS.slice(0, 3), part("stock_standard", { price: "unsold" })];
    const gap = {
      ok: false,
      reason: "required-slot",
      slotPath: "stock",
      message: "Nothing you can get fits the stock slot, and the Test Rifle needs one.",
    };
    expect(run({ slotTree: stockRequired, parts: unsoldStock })).toEqual(gap);
    // Neither the budget nor a pin is to blame when no build exists without them either.
    expect(
      run({
        slotTree: stockRequired,
        parts: unsoldStock,
        budgetRub: 50_000,
        pins: { muzzle: "muzzle_brake" },
      }),
    ).toEqual(gap);
  });

  it("follows a chain of single candidates to the slot that is really empty", () => {
    const chain = tree([
      {
        nameId: "receiver",
        required: true,
        items: [["upper", [{ nameId: "barrel", required: true, items: ["bar"] }]]],
      },
    ]);
    expect(
      run({
        slotTree: chain,
        parts: [part("upper", { name: "Upper" }), part("bar", { price: "unsold" })],
      }),
    ).toEqual({
      ok: false,
      reason: "required-slot",
      slotPath: "receiver/barrel",
      message: "Nothing you can get fits the barrel slot, and the Upper needs one.",
    });
  });

  it("names the first path's empty slot when each way to buy the gun fails at a different one", () => {
    const twoRequired = tree([
      { nameId: "front", required: true, items: ["a"] },
      { nameId: "back", required: true, items: ["b"] },
    ]);
    const offer = SMALL_WEAPON_ITEM.buyFor![0]!;
    const weaponItem = {
      ...SMALL_WEAPON_ITEM,
      buyFor: [
        offer,
        { ...offer, preset: { id: "pa", normalizedName: "with-a" } },
        { ...offer, preset: { id: "pb", normalizedName: "with-b" } },
      ],
    };
    expect(
      run({
        slotTree: twoRequired,
        weaponItem,
        presets: [
          { id: "pa", attachments: { front: "a" } },
          { id: "pb", attachments: { back: "b" } },
        ],
        parts: [part("a", { price: "unsold" }), part("b", { price: "unsold" })],
      }),
    ).toMatchObject({ ok: false, reason: "required-slot", slotPath: "front" });
  });

  it("names a pinned part below the weapon that every build must carry and nobody prices", () => {
    // The receiver is required and takes only the upper, so the pinned foregrip is on every build.
    const slotTree = tree([
      {
        nameId: "receiver",
        required: true,
        items: [["upper", [{ nameId: "foregrip", items: ["fg", "fg2"] }]]],
      },
    ]);
    const parts = [part("upper"), part("fg", { price: null }), part("fg2", { price: 500 })];
    expect(
      run({ slotTree, parts, pins: { "receiver/foregrip": "fg" }, budgetRub: 50_000 }),
    ).toEqual({
      ok: false,
      reason: "pinned-unpriced",
      itemIds: ["fg"],
      message: "No price you can pay is known for fg. Unpin it or clear the budget.",
    });
  });

  // #260 review: the pin is on a path the cheapest build under the pins avoids.
  it("names a pinned part when unpinning it gives a build of known price, though the cheapest pinned build avoids it", () => {
    const slotTree = tree([
      {
        nameId: "receiver",
        required: true,
        items: [
          ["u", [{ nameId: "x", required: true, items: ["p", "p3"] }]],
          ["u2", [{ nameId: "y", required: true, items: ["q"] }]],
          // A part the game data does not hold: the pin's path is not looked for below it.
          "ghost",
        ],
      },
    ]);
    const parts = [
      part("u", { price: 900 }),
      part("u2", { price: 100 }),
      part("p", { price: null }),
      part("p3", { price: 50 }),
      part("q", { price: null }),
    ];
    expect(ok(run({ slotTree, parts, budgetRub: 50_000 })).build.attachments).toEqual({
      receiver: "u",
      "receiver/x": "p3",
    });
    expect(run({ slotTree, parts, pins: { "receiver/x": "p" }, budgetRub: 50_000 })).toEqual({
      ok: false,
      reason: "pinned-unpriced",
      itemIds: ["p"],
      message: "No price you can pay is known for p. Unpin it or clear the budget.",
    });
  });

  // #260 review: another part nobody pinned has no price on every build too.
  it("does not blame a pin when unpinning it still leaves every build unpriced", () => {
    const pinnedOrNot = {
      ok: false,
      reason: "infeasible-budget",
      cause: "unpriced",
      message:
        "Pinned or not, no complete build has a known price on this profile, so none can be shown to fit a budget.",
    };
    // Below the weapon: the upper's required rail takes only a part nobody prices.
    const nested = tree([
      {
        nameId: "receiver",
        required: true,
        items: [
          [
            "upper",
            [
              { nameId: "foregrip", items: ["fg", "fg2"] },
              { nameId: "rail", required: true, items: ["r"] },
            ],
          ],
        ],
      },
    ]);
    const nestedParts = [
      part("upper"),
      part("fg", { price: null }),
      part("fg2", { price: 500 }),
      part("r", { price: null }),
    ];
    expect(
      run({
        slotTree: nested,
        parts: nestedParts,
        pins: { "receiver/foregrip": "fg" },
        budgetRub: 50_000,
      }),
    ).toEqual(pinnedOrNot);
    // On the weapon's own slot, where the budget is refused before any search.
    const root = tree([
      { nameId: "muzzle", items: ["m"] },
      { nameId: "stock", required: true, items: ["s"] },
    ]);
    const rootParts = [part("m", { price: null }), part("s", { price: null })];
    expect(
      run({ slotTree: root, parts: rootParts, pins: { muzzle: "m" }, budgetRub: 50_000 }),
    ).toEqual(pinnedOrNot);
    // With no pins at all, the profile is the cause.
    expect(run({ slotTree: root, parts: rootParts, budgetRub: 50_000 })).toEqual({
      ok: false,
      reason: "infeasible-budget",
      cause: "unpriced",
      message:
        "No complete build has a known price on this profile, so none can be shown to fit a budget.",
    });
  });

  it("does not blame a pin whose part, once unpinned, the profile cannot get", () => {
    // The stock is required and only the pinned part fits; with the pin gone, nothing does.
    const slotTree = tree([{ nameId: "stock", required: true, items: ["s"] }]);
    const parts = [part("s", { price: "unsold" })];
    expect(run({ slotTree, parts, pins: { stock: "s" }, budgetRub: 50_000 })).toMatchObject({
      reason: "infeasible-budget",
      cause: "unpriced",
      message: /^Pinned or not/,
    });
  });

  // #266 review (b, case d): a priced pin forces a required part nobody prices.
  it("names the pins to lift when other pins, not unpriced ones, leave every build unpriced", () => {
    const slotTree = tree([
      {
        nameId: "a",
        items: [["pa", [{ nameId: "c", required: true, items: ["uc"] }]], "pa2"],
      },
      { nameId: "m", items: ["um", "m2"] },
      { nameId: "extra", items: ["pa2"] },
    ]);
    const parts = [
      part("pa", { price: 100 }),
      part("pa2", { price: 100 }),
      part("uc", { price: null }),
      part("um", { price: null }),
      part("m2", { price: 100 }),
    ];
    // The unpriced pin on m is not enough: pa still forces uc. Lifting the pin on a is. The
    // build of known price leaves `extra` empty too, so that pin is no obstacle.
    expect(
      run({ slotTree, parts, budgetRub: 50_000, pins: { a: "pa", m: "um", extra: null } }),
    ).toEqual({
      ok: false,
      reason: "infeasible-budget",
      cause: "pins",
      paths: ["a", "m"],
      message:
        "No complete build that keeps your pins has a known price on this profile, so none can be shown to fit a budget.",
    });
    expect(run({ slotTree, parts, budgetRub: 50_000, pins: { a: "pa" } })).toMatchObject({
      cause: "pins",
      paths: ["a"],
    });
  });

  // #266 review (b, cases c/c'): a preset of unknown price that comes with the pinned part.
  it("does not count a preset of unknown price as pricing a pinned part", () => {
    const slotTree = tree([
      {
        nameId: "handguard",
        required: true,
        items: [["hg1", [{ nameId: "foregrip", items: ["fg", "fg2"] }]]],
      },
    ]);
    const parts = [part("hg1", { price: 100 }), part("fg", { price: null }), part("fg2")];
    const preset = { id: "P1", normalizedName: "p1" };
    const weaponItem = {
      ...SMALL_WEAPON_ITEM,
      buyFor: [
        SMALL_WEAPON_ITEM.buyFor![0]!,
        { ...SMALL_WEAPON_ITEM.buyFor![0]!, priceRUB: null, preset },
      ],
    };
    const presets = [{ id: "P1", attachments: { handguard: "hg1", "handguard/foregrip": "fg" } }];
    const pins = { "handguard/foregrip": "fg" };
    expect(run({ slotTree, parts, weaponItem, presets, pins, budgetRub: 50_000 })).toEqual({
      ok: false,
      reason: "pinned-unpriced",
      itemIds: ["fg"],
      message: "No price you can pay is known for fg. Unpin it or clear the budget.",
    });
    // On the weapon's own slot, where the budget is refused before any search.
    const root = tree([{ nameId: "muzzle", items: ["m", "m2"] }]);
    expect(
      run({
        slotTree: root,
        parts: [part("m", { price: null }), part("m2")],
        weaponItem,
        presets: [{ id: "P1", attachments: { muzzle: "m" } }],
        pins: { muzzle: "m" },
        budgetRub: 50_000,
      }),
    ).toMatchObject({ reason: "pinned-unpriced", itemIds: ["m"] });
  });

  // #266 review (a): a second unpriced pin on a path the freed build does not have.
  it("names only the unpriced pins the build of known price has a slot for", () => {
    const slotTree = tree([
      { nameId: "S", items: ["p", "p2"] },
      {
        nameId: "receiver",
        required: true,
        items: ["u", ["u2", [{ nameId: "y", items: ["q", "q2"] }]]],
      },
    ]);
    const parts = [
      part("p", { price: null }),
      part("p2", { price: 500 }),
      part("u", { price: 100 }),
      part("u2", { price: 900 }),
      part("q", { price: null }),
      part("q2", { price: 50 }),
    ];
    expect(
      run({ slotTree, parts, pins: { S: "p", "receiver/y": "q" }, budgetRub: 50_000 }),
    ).toMatchObject({ reason: "pinned-unpriced", itemIds: ["p"] });
  });

  it("keeps a pinned-part refusal when asking whether any build exists runs out of time", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(10_000);
    expect(
      run({ profile: fleaOff, budgetRub: 50_000, pins: { muzzle: "muzzle_brake" } }),
    ).toMatchObject({
      reason: "infeasible-budget",
      cause: "pins",
      paths: ["muzzle"],
      message: /keeps your pins/,
    });
  });

  it("keeps a budget refusal when asking whether any build exists runs out of time", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(10_000);
    expect(run({ budgetRub: 9_999 })).toMatchObject({ reason: "infeasible-budget" });
  });

  it("names a required slot before the budget when no build exists at any budget", () => {
    const unsoldStock = [...SMALL_MODS.slice(0, 3), part("stock_standard", { price: "unsold" })];
    const gap = {
      ok: false,
      reason: "required-slot",
      slotPath: "stock",
      message: "Nothing you can get fits the stock slot, and the Test Rifle needs one.",
    };
    expect(run({ slotTree: stockRequired, parts: unsoldStock, budgetRub: 9_999 })).toEqual(gap);
    expect(
      run({
        slotTree: stockRequired,
        parts: unsoldStock,
        profile: fleaOff,
        budgetRub: 50_000,
        pins: { muzzle: "muzzle_brake" },
      }),
    ).toEqual(gap);
  });

  it("names a part needed more often than the presets that supply it", () => {
    const offer = SMALL_WEAPON_ITEM.buyFor![0]!;
    const withPresets = (ids: string[]) => ({
      ...SMALL_WEAPON_ITEM,
      buyFor: [offer, ...ids.map((id) => ({ ...offer, preset: { id, normalizedName: id } }))],
    });
    const one = tree([
      { nameId: "front", required: true, items: ["p4"] },
      { nameId: "back", required: true, items: ["p4"] },
    ]);
    expect(
      run({
        slotTree: one,
        parts: [part("p4", { price: "unsold" })],
        weaponItem: withPresets(["pa", "pb"]),
        presets: [
          { id: "pa", attachments: { front: "p4" } },
          { id: "pb", attachments: { back: "p4" } },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: "required-slot",
      slotPath: "front",
      message:
        "You can get the p4 only with the gun, and no way to buy it comes with as many as a complete build needs.",
    });
    // Deeper down: the first slot every build fills that takes it is named, not one under a
    // slot a build may leave empty, though the search reaches that first.
    const nested = tree([
      {
        nameId: "optional",
        items: [["rail", [{ nameId: "front", required: true, items: ["p4"] }]]],
      },
      {
        nameId: "receiver",
        required: true,
        items: [
          "uncatalogued",
          [
            "upper",
            [
              { nameId: "front", required: true, items: ["p4"] },
              { nameId: "back", required: true, items: ["p4"] },
            ],
          ],
        ],
      },
      { nameId: "side", required: true, items: ["upper"] },
    ]);
    expect(
      run({
        slotTree: nested,
        parts: [part("rail"), part("upper"), part("p4", { price: "unsold" })],
        weaponItem: withPresets(["pa", "pb"]),
        presets: [
          { id: "pa", attachments: { receiver: "upper", "receiver/front": "p4" } },
          { id: "pb", attachments: { receiver: "upper", "receiver/back": "p4" } },
        ],
      }),
    ).toMatchObject({ reason: "required-slot", slotPath: "receiver/front" });
    const two = tree([
      { nameId: "a", required: true, items: ["p"] },
      { nameId: "b", required: true, items: ["p"] },
      { nameId: "c", required: true, items: ["q"] },
      { nameId: "d", required: true, items: ["q"] },
    ]);
    expect(
      run({
        slotTree: two,
        parts: [part("p", { price: "unsold" }), part("q", { price: "unsold" })],
        weaponItem: withPresets(["pa"]),
        presets: [{ id: "pa", attachments: { a: "p", c: "q" } }],
      }),
    ).toEqual({
      ok: false,
      reason: "required-slot",
      slotPath: "a",
      message:
        "You can get the p, q only with the gun, and no way to buy it comes with as many of each as a complete build needs.",
    });
    // Each preset has enough of one and too few of the other: neither is short alone.
    const offer2 = withPresets(["pa", "pb"]);
    expect(
      run({
        slotTree: two,
        parts: [part("p", { price: "unsold" }), part("q", { price: "unsold" })],
        weaponItem: offer2,
        presets: [
          { id: "pa", attachments: { a: "p", b: "p", c: "q" } },
          { id: "pb", attachments: { a: "p", c: "q", d: "q" } },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: "required-slot",
      slotPath: "a",
      message:
        "You can get the p, q only with the gun, and no way to buy it comes with enough of them together for a complete build.",
    });
  });

  it("says the parts clash when every complete build has a conflict", () => {
    const bothRequired = tree([
      { nameId: "grip", required: true, items: ["grip_vertical"] },
      { nameId: "stock", required: true, items: ["stock_standard"] },
    ]);
    const parts = SMALL_MODS.map((m) =>
      m.id === "stock_standard" ? { ...m, conflictingItems: ["grip_vertical"] } : m,
    );
    expect(run({ slotTree: bothRequired, parts })).toEqual({
      ok: false,
      reason: "no-valid-combinations",
      message: "Every complete build has parts that can't be fitted together.",
    });
  });
});

describe("optimize — pins", () => {
  it("keeps every pin it can, and says why it drops the rest", () => {
    const stockRequired = tree([
      { nameId: "muzzle", items: ["muzzle_brake", "muzzle_silencer"] },
      { nameId: "grip", items: ["grip_vertical"] },
      { nameId: "stock", required: true, items: ["stock_standard"] },
    ]);
    const result = ok(
      run({
        slotTree: stockRequired,
        pins: {
          muzzle: "muzzle_silencer",
          grip: "muzzle_brake",
          stock: null,
          "muzzle/thread": "grip_vertical",
          "grip/rail": "ghost",
        },
      }),
    );
    expect(result.build.attachments).toEqual({
      muzzle: "muzzle_silencer",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
    expect(result.pins).toEqual({
      honoured: ["muzzle"],
      dropped: [
        { path: "grip", itemId: "muzzle_brake", reason: "not-allowed" },
        { path: "grip/rail", itemId: "ghost", reason: "unknown-item" },
        { path: "muzzle/thread", itemId: "grip_vertical", reason: "absent" },
        { path: "stock", itemId: null, reason: "required" },
      ],
    });
  });

  it("places a pinned part the profile can't get, and leaves a slot pinned empty empty", () => {
    expect(
      ok(run({ profile: fleaOff, pins: { muzzle: "muzzle_brake" } })).build.attachments,
    ).toEqual({ muzzle: "muzzle_brake" });
    const result = ok(run({ pins: { grip: null } }));
    expect(result.build.attachments).toEqual({ muzzle: "muzzle_brake", stock: "stock_standard" });
    expect(result.pins.honoured).toEqual(["grip"]);
  });

  it("pins nested paths wherever the build has them", () => {
    const nested = tree([
      { nameId: "handguard", items: [["hg", [{ nameId: "rail", items: ["r1", "r2"] }]]] },
    ]);
    const parts = [
      part("hg", { recoil: 0.01 }),
      part("r1", { recoil: -0.05 }),
      part("r2", { recoil: -0.02 }),
    ];
    const result = ok(run({ slotTree: nested, parts, pins: { "handguard/rail": "r2" } }));
    expect(result.build.attachments).toEqual({ handguard: "hg", "handguard/rail": "r2" });
    expect(result.pins).toEqual({ honoured: ["handguard/rail"], dropped: [] });
  });
});
