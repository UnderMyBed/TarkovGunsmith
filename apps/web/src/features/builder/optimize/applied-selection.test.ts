import { describe, it, expect } from "vitest";
import { partsById, type AttachablePart, type BuildV6 } from "@tarkov/data";
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
