import { describe, it, expect } from "vitest";
import { partsById, resolveBuild, type AttachablePart, type BuildV6 } from "@tarkov/data";
import { tinyTree } from "../../../test/tiny-tree.js";
import { appliedSelection, toggleChange } from "./applied-selection.js";
import { buildFromSelection } from "./build-from-selection.js";

// The new barrel brings a required gas block and a muzzle slot that takes a part the old
// barrel's muzzle slot does not.
const tree = tinyTree("w1", [
  {
    nameId: "barrel",
    name: "Barrel",
    items: [
      ["b-old", [{ nameId: "muzzle", name: "Muzzle", items: ["mz-a"] }]],
      [
        "b-new",
        [
          { nameId: "gas", name: "Gas block", required: true, items: ["g-1"] },
          { nameId: "muzzle", name: "Muzzle", items: ["mz-a", "mz-b"] },
        ],
      ],
    ],
  },
  { nameId: "stock", name: "Stock", items: ["s-old", "s-new"] },
]);

const PARTS = partsById(
  ["b-old", "b-new", "g-1", "mz-a", "mz-b", "s-old", "s-new"].map((id): AttachablePart => ({
    id,
    name: id,
    shortName: id,
    iconLink: "https://assets.tarkov.dev/x.webp",
    weight: 0,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics: 0,
      recoilModifier: 0,
      accuracyModifier: 0,
      velocity: 0,
    },
    buyFor: [],
    conflictingItems: [],
    conflictingSlotIds: [],
  })),
);

const build = (attachments: Record<string, string>): BuildV6 => ({
  version: 6,
  weaponId: "w1",
  attachments,
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
});

const current = build({ barrel: "b-old", "barrel/muzzle": "mz-a", stock: "s-old" });
const proposed = build({
  barrel: "b-new",
  "barrel/gas": "g-1",
  "barrel/muzzle": "mz-b",
  stock: "s-new",
});
const ALL = new Set(["barrel", "barrel/gas", "barrel/muzzle", "stock"]);

const view = (ticked: ReadonlySet<string>) =>
  appliedSelection(current, proposed, ticked, tree, PARTS);
const toggle = (path: string, ticked: ReadonlySet<string>) =>
  toggleChange(path, current, proposed, ticked, tree, PARTS);

describe("appliedSelection", () => {
  it("lands every change when all are ticked", () => {
    const v = view(ALL);
    expect(v.landed).toBe(4);
    expect(v.changed).toBe(true);
    expect(v.build.attachments).toEqual(proposed.attachments);
  });

  it("shows a change under an unticked parent change as not landing, and says what it needs", () => {
    // The raw ticks still hold the muzzle: buildFromSelection drops it (the old barrel's
    // muzzle slot does not take mz-b), so it must not show ticked or count.
    const v = view(new Set(["stock", "barrel/muzzle"]));
    expect(v.rows.get("barrel/muzzle")).toEqual({
      landed: false,
      disabled: false,
      note: "needs the new Barrel",
    });
    expect(v.rows.get("barrel/gas")).toMatchObject({ landed: false, note: "needs the new Barrel" });
    expect(v.landed).toBe(1);
  });

  it("won't let a required change be unticked alone while its parent change is ticked", () => {
    const v = view(ALL);
    expect(v.rows.get("barrel/gas")).toEqual({
      landed: true,
      disabled: true,
      note: "required by the new Barrel",
    });
    expect(toggle("barrel/gas", ALL)).toBe(ALL);
  });

  it("says when nothing ticked changes the build", () => {
    const v = view(new Set());
    expect(v.landed).toBe(0);
    expect(v.changed).toBe(false);
    expect(v.build.attachments).toEqual(current.attachments);
  });
});

describe("toggleChange", () => {
  it("unticking a parent change unticks every change below it", () => {
    const next = toggle("barrel", ALL);
    expect([...next].sort()).toEqual(["stock"]);
    const v = view(next);
    expect(v.landed).toBe(1);
    expect(v.build.attachments).toEqual({
      barrel: "b-old",
      "barrel/muzzle": "mz-a",
      stock: "s-new",
    });
  });

  it("ticking a child change ticks the parent change it needs, and its required siblings", () => {
    const next = toggle("barrel/muzzle", new Set(["stock"]));
    expect([...next].sort()).toEqual(["barrel", "barrel/gas", "barrel/muzzle", "stock"]);
    expect(view(next).landed).toBe(4);
  });

  it("ticking a parent change brings every change below it, not only the required ones", () => {
    const next = toggle("barrel", new Set(["stock"]));
    expect([...next].sort()).toEqual(["barrel", "barrel/gas", "barrel/muzzle", "stock"]);
    expect(view(next).landed).toBe(4);
  });

  it("ticking a change that needs the new part brings that part and all its changes", () => {
    const none = toggle("barrel", ALL);
    expect([...none].sort()).toEqual(["stock"]);
    expect(view(none).rows.get("barrel/muzzle")?.note).toBe("needs the new Barrel");
    const next = toggle("barrel/muzzle", none);
    expect([...next].sort()).toEqual(["barrel", "barrel/gas", "barrel/muzzle", "stock"]);
  });

  it("says an unticked change under a landed new part leaves the slot empty", () => {
    const next = toggle("barrel/muzzle", ALL);
    const v = view(next);
    expect(v.build.attachments["barrel/muzzle"]).toBeUndefined();
    // mz-a fits the new barrel's muzzle slot too, but it belonged to the old barrel.
    expect(v.rows.get("barrel/muzzle")).toEqual({
      landed: false,
      disabled: false,
      note: "left empty: mz-a stays with the old Barrel",
    });
    expect(v.landed).toBe(3);
  });

  it("ticking a parent change brings its required changes, so Apply never leaves one empty", () => {
    const next = toggle("barrel", new Set());
    expect(next.has("barrel/gas")).toBe(true);
    const applied = buildFromSelection(current, proposed, next, tree, PARTS).attachments;
    expect(applied["barrel/gas"]).toBe("g-1");
  });
});

describe("required, read from the part that is on the build", () => {
  // The same paths under each pair of parts: the new handguard requires its mount where the
  // old one did not; the new rail leaves its mount optional where the old one required it.
  const tree2 = tinyTree("w1", [
    {
      nameId: "hg",
      name: "Handguard",
      items: [
        ["h-old", [{ nameId: "mount", name: "Mount", items: ["m1"] }]],
        ["h-new", [{ nameId: "mount", name: "Mount", required: true, items: ["m2"] }]],
      ],
    },
    {
      nameId: "rail",
      name: "Rail",
      items: [
        ["r-old", [{ nameId: "mnt", name: "Rail mount", required: true, items: ["x1"] }]],
        ["r-new", [{ nameId: "mnt", name: "Rail mount", items: ["x2"] }]],
      ],
    },
  ]);
  const PARTS2 = partsById(
    ["h-old", "h-new", "m1", "m2", "r-old", "r-new", "x1", "x2"].map((id) => ({
      ...PARTS.get("b-old")!,
      id,
      name: id,
    })),
  );
  const cur = build({ hg: "h-old", "hg/mount": "m1", rail: "r-old", "rail/mnt": "x1" });
  const prop = build({ hg: "h-new", "hg/mount": "m2", rail: "r-new", "rail/mnt": "x2" });
  const all = new Set(["hg", "hg/mount", "rail", "rail/mnt"]);
  const v2 = (t: ReadonlySet<string>) => appliedSelection(cur, prop, t, tree2, PARTS2);
  const t2 = (path: string, t: ReadonlySet<string>) =>
    toggleChange(path, cur, prop, t, tree2, PARTS2);

  it("won't untick a mount the new part requires, though the old part's was optional", () => {
    expect(v2(all).rows.get("hg/mount")).toEqual({
      landed: true,
      disabled: true,
      note: "required by the new Handguard",
    });
    expect(t2("hg/mount", all)).toBe(all);
    // Unticking the handguard and ticking it again brings its mount back with it.
    const again = t2("hg", t2("hg", all));
    expect(v2(again).build.attachments["hg/mount"]).toBe("m2");
  });

  it("lets a mount the new part leaves optional be unticked, though the old part's was required", () => {
    expect(v2(all).rows.get("rail/mnt")).toEqual({ landed: true, disabled: false, note: null });
    const next = t2("rail/mnt", all);
    expect(next.has("rail/mnt")).toBe(false);
    const v = v2(next);
    expect(v.build.attachments["rail/mnt"]).toBeUndefined();
    expect(v.rows.get("rail/mnt")?.note).toBe("left empty: x1 doesn't fit the new Rail");
  });
});

describe("a part the proposal takes off under a new parent part", () => {
  // The new barrel comes without the old barrel's muzzle: Apply drops the muzzle with the old
  // barrel whatever the muzzle row's tick, so the row is locked rather than a dead click.
  const bare = build({ barrel: "b-new", "barrel/gas": "g-1" });
  const all = new Set(["barrel", "barrel/gas", "barrel/muzzle"]);
  const v3 = (t: ReadonlySet<string>) => appliedSelection(current, bare, t, tree, PARTS);

  it("locks the removal with the parent part it comes off with", () => {
    expect(v3(all).rows.get("barrel/muzzle")).toEqual({
      landed: true,
      disabled: true,
      note: "comes off with the old Barrel",
    });
    expect(toggleChange("barrel/muzzle", current, bare, all, tree, PARTS)).toBe(all);
    const without = new Set(["barrel", "barrel/gas"]);
    expect(v3(without).build.attachments["barrel/muzzle"]).toBeUndefined();
    expect(v3(without).rows.get("barrel/muzzle")?.landed).toBe(true);
  });
});

describe("a change whose part clashes with a part another change takes off", () => {
  /** Hand-built parts with the given `conflictingItems`. */
  const partsWith = (ids: readonly string[], clashes: Record<string, string[]> = {}) =>
    partsById(
      ids.map((id) => ({
        ...PARTS.get("b-old")!,
        id,
        name: id,
        conflictingItems: clashes[id] ?? [],
      })),
    );
  const conflictsOf = (t: Parameters<typeof tinyTree>[1], p: typeof PARTS, b: BuildV6) =>
    resolveBuild(tinyTree("w1", t), b.attachments, p).conflicts;

  // The issue's probe: the new handguard clashes with the current stock, and the proposal
  // replaces the stock to make room.
  const slots = [
    { nameId: "hg", name: "Handguard", items: ["h-old", "h-new"] },
    { nameId: "stock", name: "Stock", items: ["s-old", "s-new"] },
  ];
  const probeTree = tinyTree("w1", slots);
  const probeParts = partsWith(["h-old", "h-new", "s-old", "s-new"], { "h-new": ["s-old"] });
  const cur = build({ hg: "h-old", stock: "s-old" });
  const prop = build({ hg: "h-new", stock: "s-new" });
  const all = new Set(["hg", "stock"]);
  const v = (t: ReadonlySet<string>) => appliedSelection(cur, prop, t, probeTree, probeParts);
  const t = (path: string, ticked: ReadonlySet<string>) =>
    toggleChange(path, cur, prop, ticked, probeTree, probeParts);

  it("unticking the stock unticks the handguard that needs it gone", () => {
    expect(v(all).rows.get("stock")).toEqual({
      landed: true,
      disabled: false,
      note: "makes room for the new Handguard",
    });
    const next = t("stock", all);
    expect([...next]).toEqual([]);
    const after = v(next);
    expect(after.build.attachments).toEqual({ hg: "h-old", stock: "s-old" });
    expect(conflictsOf(slots, probeParts, after.build)).toEqual([]);
    expect(after.rows.get("hg")).toEqual({
      landed: false,
      disabled: false,
      note: "conflicts with s-old",
    });
    expect(after.landed).toBe(0);
  });

  it("re-ticking the handguard re-ticks the stock", () => {
    const back = t("hg", t("stock", all));
    expect([...back].sort()).toEqual(["hg", "stock"]);
    expect(v(back).build.attachments).toEqual(prop.attachments);
  });

  it("unticking the handguard alone keeps the new stock", () => {
    const next = t("hg", all);
    expect([...next]).toEqual(["stock"]);
    expect(v(next).build.attachments).toEqual({ hg: "h-old", stock: "s-new" });
    expect(v(next).rows.get("hg")?.note).toBeNull();
  });

  it("follows a chain: a needs b's old part gone, b needs c's", () => {
    const chain = ["a", "b", "c"].map((s) => ({
      nameId: s,
      name: s.toUpperCase(),
      items: [`${s}-old`, `${s}-new`],
    }));
    const tr = tinyTree("w1", chain);
    const ps = partsWith(["a-old", "a-new", "b-old", "b-new", "c-old", "c-new"], {
      "a-new": ["b-old"],
      "c-old": ["b-new"],
    });
    const c0 = build({ a: "a-old", b: "b-old", c: "c-old" });
    const p0 = build({ a: "a-new", b: "b-new", c: "c-new" });
    const tg = (path: string, ticked: ReadonlySet<string>) =>
      toggleChange(path, c0, p0, ticked, tr, ps);
    expect([...tg("a", new Set())].sort()).toEqual(["a", "b", "c"]);
    expect([...tg("c", new Set(["a", "b", "c"]))]).toEqual([]);
    expect([...tg("b", new Set(["a", "b", "c"]))]).toEqual(["c"]);
  });

  // The captured M4A1 proposal's shape: the new barrel clashes with the old handguard, and the
  // new handguard with the old barrel's gas block, which goes only with the old barrel.
  const cycle = [
    {
      nameId: "barrel",
      name: "Barrel",
      items: [
        ["b-old", [{ nameId: "gas", name: "Gas block", required: true, items: ["g-old"] }]],
        ["b-new", [{ nameId: "gas", name: "Gas block", required: true, items: ["g-new"] }]],
      ] as const,
    },
    { nameId: "hg", name: "Handguard", items: ["h-old", "h-new"] },
  ];
  const cycleTree = tinyTree("w1", cycle);
  const cycleParts = partsWith(["b-old", "b-new", "g-old", "g-new", "h-old", "h-new"], {
    "b-new": ["h-old"],
    "h-new": ["g-old"],
  });
  const cc = build({ barrel: "b-old", "barrel/gas": "g-old", hg: "h-old" });
  const cp = build({ barrel: "b-new", "barrel/gas": "g-new", hg: "h-new" });
  const callTicked = new Set(["barrel", "barrel/gas", "hg"]);
  const ct = (path: string, ticked: ReadonlySet<string>) =>
    toggleChange(path, cc, cp, ticked, cycleTree, cycleParts);
  const cv = (ticked: ReadonlySet<string>) =>
    appliedSelection(cc, cp, ticked, cycleTree, cycleParts);

  it("ticks and unticks two changes that each clear the other's clash together", () => {
    expect([...ct("barrel", callTicked)]).toEqual([]);
    expect([...ct("hg", callTicked)]).toEqual([]);
    expect(cv(callTicked).rows.get("barrel")?.note).toBe("makes room for the new Handguard");
    expect(cv(callTicked).rows.get("hg")?.note).toBe("makes room for the new Barrel");
    // Ticking the handguard brings the barrel, through the old gas block it has to take off.
    expect([...ct("hg", new Set())].sort()).toEqual(["barrel", "barrel/gas", "hg"]);
    expect(cv(new Set()).rows.get("hg")?.note).toBe("conflicts with g-old");
  });

  it("unticks a required change's new parent part rather than leave its slot empty", () => {
    // The new barrel's required gas block clashes with the current stock.
    const tr = tinyTree("w1", [
      cycle[0] as Parameters<typeof tinyTree>[1][number],
      { nameId: "stock", name: "Stock", items: ["s-old", "s-new"] },
    ]);
    const ps = partsWith(["b-old", "b-new", "g-old", "g-new", "s-old", "s-new"], {
      "g-new": ["s-old"],
    });
    const c0 = build({ barrel: "b-old", "barrel/gas": "g-old", stock: "s-old" });
    const p0 = build({ barrel: "b-new", "barrel/gas": "g-new", stock: "s-new" });
    const next = toggleChange("stock", c0, p0, new Set(["barrel", "barrel/gas", "stock"]), tr, ps);
    expect([...next]).toEqual([]);
    const after = resolveBuild(tr, appliedSelection(c0, p0, next, tr, ps).build.attachments, ps);
    expect(after.missingRequired).toEqual([]);
    expect(after.conflicts).toEqual([]);
    // The note names what goes with the stock: the barrel, which the gas block goes with.
    const all3 = new Set(["barrel", "barrel/gas", "stock"]);
    expect(appliedSelection(c0, p0, all3, tr, ps).rows.get("stock")?.note).toBe(
      "makes room for the new Barrel",
    );
  });

  it("unticks the change that brought the clashing part, not a part above the one unticked", () => {
    // Both handguards carry the same rail; the mount under it changes. The new stock clashes
    // with the old mount. Unticking the mount brings the old mount back: the stock has to go,
    // not the handguard the mount sits under.
    const tr = tinyTree("w1", [
      {
        nameId: "hg",
        name: "Handguard",
        items: [
          [
            "h-old",
            [{ nameId: "rail", items: [["r", [{ nameId: "mount", items: ["m-old", "m-new"] }]]] }],
          ],
          [
            "h-new",
            [{ nameId: "rail", items: [["r", [{ nameId: "mount", items: ["m-old", "m-new"] }]]] }],
          ],
        ],
      },
      { nameId: "stock", name: "Stock", items: ["s-old", "s-new"] },
    ]);
    const ps = partsWith(["h-old", "h-new", "r", "m-old", "m-new", "s-old", "s-new"], {
      "s-new": ["m-old"],
    });
    const c0 = build({ hg: "h-old", "hg/rail": "r", "hg/rail/mount": "m-old", stock: "s-old" });
    const p0 = build({ hg: "h-new", "hg/rail": "r", "hg/rail/mount": "m-new", stock: "s-new" });
    const every = new Set(appliedSelection(c0, p0, new Set(), tr, ps).rows.keys());
    expect([...every].sort()).toEqual(["hg", "hg/rail/mount", "stock"]);
    const next = toggleChange("hg/rail/mount", c0, p0, every, tr, ps);
    expect([...next]).toEqual(["hg"]);
    const v0 = appliedSelection(c0, p0, next, tr, ps);
    expect(v0.build.attachments).toEqual({
      hg: "h-new",
      "hg/rail": "r",
      "hg/rail/mount": "m-old",
      stock: "s-old",
    });
    expect(resolveBuild(tr, v0.build.attachments, ps).conflicts).toEqual([]);
    expect(appliedSelection(c0, p0, every, tr, ps).rows.get("hg/rail/mount")?.note).toBe(
      "makes room for the new Stock",
    );
  });

  it("does not count a clash the current build has as new when the new parent orders its slots differently", () => {
    // The old handguard lists its rail before its side slot, the new one after; the side part
    // clashes with the old mount on both. That clash is the current build's, whichever comes first.
    const tr = tinyTree("w1", [
      {
        nameId: "hg",
        name: "Handguard",
        items: [
          [
            "h-old",
            [
              { nameId: "rail", items: [["r", [{ nameId: "mount", items: ["m-old", "m-new"] }]]] },
              { nameId: "side", items: ["p"] },
            ],
          ],
          [
            "h-new",
            [
              { nameId: "side", items: ["p"] },
              { nameId: "rail", items: [["r", [{ nameId: "mount", items: ["m-old", "m-new"] }]]] },
            ],
          ],
        ],
      },
    ]);
    const ps = partsWith(["h-old", "h-new", "r", "m-old", "m-new", "p"], { p: ["m-old"] });
    const base = { "hg/rail": "r", "hg/side": "p" };
    const c0 = build({ hg: "h-old", ...base, "hg/rail/mount": "m-old" });
    const p0 = build({ hg: "h-new", ...base, "hg/rail/mount": "m-new" });
    const every = new Set(["hg", "hg/rail/mount"]);
    expect(appliedSelection(c0, p0, every, tr, ps).rows.get("hg/rail/mount")?.note).toBeNull();
    expect([...toggleChange("hg/rail/mount", c0, p0, every, tr, ps)]).toEqual(["hg"]);
  });

  it("leaves a clash the current build already has to the build, not to the ticks", () => {
    const ps = partsWith(["h-old", "h-new", "s-old", "s-new"], { "s-old": ["h-old"] });
    const p0 = build({ hg: "h-old", stock: "s-new" });
    const next = toggleChange("stock", cur, p0, new Set(["stock"]), probeTree, ps);
    expect([...next]).toEqual([]);
    expect(appliedSelection(cur, p0, next, probeTree, ps).rows.get("stock")?.note).toBeNull();
  });
});
