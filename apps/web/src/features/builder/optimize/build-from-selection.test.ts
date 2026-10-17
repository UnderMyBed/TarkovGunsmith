import { describe, it, expect } from "vitest";
import { partsById, resolveBuild, type AttachablePart, type BuildV6 } from "@tarkov/data";
import { buildFromSelection } from "./build-from-selection.js";
import { slotDiff } from "./slot-diff.js";
import { tinyTree } from "../../../test/tiny-tree.js";

// Two uppers with the same slot names; two barrels whose gas-block slots allow different parts.
const upperSlots = [
  {
    nameId: "barrel",
    items: [
      ["b-short", [{ nameId: "gas", items: ["g-std"] }]],
      ["b-long", [{ nameId: "gas", items: ["g-std", "g-low"] }]],
    ] as const,
  },
  { nameId: "handguard", items: ["h-1"] },
];
const tree = tinyTree("w1", [
  {
    nameId: "upper",
    items: [
      ["u-1", upperSlots],
      ["u-2", upperSlots],
    ],
  },
  { nameId: "muzzle", items: ["m-old", "m-new"] },
  { nameId: "stock", items: ["s-keep"] },
]);

/** Every id in these tests is a part with no stats and no conflicts: structure only. */
const KNOWN = partsById(
  ["u-1", "u-2", "b-short", "b-long", "g-std", "g-low", "h-1", "m-old", "m-new", "s-keep"].map(
    (id): AttachablePart => ({
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
    }),
  ),
);

function build(attachments: Record<string, string>): BuildV6 {
  return {
    version: 6,
    weaponId: "w1",
    attachments,
    orphaned: ["o-1"],
    createdAt: "2026-04-22T00:00:00Z",
  };
}

/** Every row the optimizer view would show: its accept-all selection. */
function allRows(current: BuildV6, proposed: BuildV6): Set<string> {
  return new Set(
    slotDiff(current.attachments, proposed.attachments, tree, KNOWN, null).map((r) => r.slotId),
  );
}

function apply(current: BuildV6, proposed: BuildV6, selected: Iterable<string>) {
  return buildFromSelection(current, proposed, new Set(selected), tree, KNOWN).attachments;
}

describe("buildFromSelection", () => {
  it("equals the current build when nothing is selected", () => {
    const current = build({ muzzle: "m-old", stock: "s-keep" });
    expect(apply(current, build({ muzzle: "m-new" }), [])).toEqual(current.attachments);
  });

  it("applies only the selected top-level rows", () => {
    const current = build({ muzzle: "m-old", stock: "s-keep" });
    const proposed = build({ muzzle: "m-new" });
    expect(apply(current, proposed, ["muzzle"])).toEqual({ muzzle: "m-new", stock: "s-keep" });
    expect(apply(current, proposed, ["stock"])).toEqual({ muzzle: "m-old" });
  });

  it("accept-all on a barrel swap keeps the gas block the proposal kept", () => {
    const current = build({ upper: "u-1", "upper/barrel": "b-short", "upper/barrel/gas": "g-std" });
    const proposed = build({ upper: "u-1", "upper/barrel": "b-long", "upper/barrel/gas": "g-std" });
    const rows = allRows(current, proposed);
    expect([...rows]).toEqual(["upper/barrel"]);
    expect(apply(current, proposed, rows)).toEqual(
      resolveBuild(tree, proposed.attachments, KNOWN).attachments,
    );
  });

  it("accept-all on an upper swap keeps the whole subtree the proposal kept", () => {
    const subtree = {
      "upper/barrel": "b-long",
      "upper/barrel/gas": "g-low",
      "upper/handguard": "h-1",
    };
    const current = build({ upper: "u-1", ...subtree });
    const proposed = build({ upper: "u-2", ...subtree, muzzle: "m-new" });
    const rows = allRows(current, proposed);
    expect([...rows].sort()).toEqual(["muzzle", "upper"]);
    expect(apply(current, proposed, rows)).toEqual(
      resolveBuild(tree, proposed.attachments, KNOWN).attachments,
    );
  });

  it("drops a deselected row beneath a selected one rather than keeping the old part", () => {
    const current = build({ upper: "u-1", "upper/barrel": "b-short", "upper/barrel/gas": "g-std" });
    const proposed = build({ upper: "u-1", "upper/barrel": "b-long", "upper/barrel/gas": "g-low" });
    expect([...allRows(current, proposed)]).toEqual(["upper/barrel", "upper/barrel/gas"]);
    expect(apply(current, proposed, ["upper/barrel"])).toEqual({
      upper: "u-1",
      "upper/barrel": "b-long",
    });
  });

  it("keeps a deselected part whose parent is unchanged beneath a selected grandparent", () => {
    const current = build({ upper: "u-1", "upper/barrel": "b-long", "upper/barrel/gas": "g-std" });
    const proposed = build({ upper: "u-2", "upper/barrel": "b-long", "upper/barrel/gas": "g-low" });
    expect([...allRows(current, proposed)].sort()).toEqual(["upper", "upper/barrel/gas"]);
    expect(apply(current, proposed, ["upper"])).toEqual({
      upper: "u-2",
      "upper/barrel": "b-long",
      "upper/barrel/gas": "g-std",
    });
  });

  it("lands a selected row beneath a kept parent only where that parent takes it", () => {
    const current = build({ upper: "u-1", "upper/barrel": "b-short" });
    const takes = build({ upper: "u-1", "upper/barrel": "b-long", "upper/barrel/gas": "g-std" });
    const refuses = build({ upper: "u-1", "upper/barrel": "b-long", "upper/barrel/gas": "g-low" });
    // The short barrel's gas slot takes g-std but not g-low.
    expect(apply(current, takes, ["upper/barrel/gas"])).toEqual({
      upper: "u-1",
      "upper/barrel": "b-short",
      "upper/barrel/gas": "g-std",
    });
    expect(apply(current, refuses, ["upper/barrel/gas"])).toEqual({
      upper: "u-1",
      "upper/barrel": "b-short",
    });
  });

  it("removes a part when its row is selected and the proposal empties the slot", () => {
    const current = build({ upper: "u-1", "upper/handguard": "h-1", muzzle: "m-old" });
    const proposed = build({ upper: "u-1", muzzle: "m-old" });
    expect(apply(current, proposed, ["upper/handguard"])).toEqual({
      upper: "u-1",
      muzzle: "m-old",
    });
  });

  it("preserves metadata (weaponId, orphaned, createdAt) from current", () => {
    const current = build({ muzzle: "m-old" });
    const out = buildFromSelection(
      current,
      build({ muzzle: "m-new" }),
      new Set(["muzzle"]),
      tree,
      KNOWN,
    );
    expect(out.weaponId).toBe(current.weaponId);
    expect(out.orphaned).toEqual(current.orphaned);
    expect(out.createdAt).toBe(current.createdAt);
    expect(out.version).toBe(6);
  });
});
