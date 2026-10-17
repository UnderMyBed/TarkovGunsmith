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

  it("ticking a parent change brings its required changes, so Apply never leaves one empty", () => {
    const next = toggle("barrel", new Set());
    expect(next.has("barrel/gas")).toBe(true);
    const applied = buildFromSelection(current, proposed, next, tree, PARTS).attachments;
    expect(applied["barrel/gas"]).toBe("g-1");
  });
});
