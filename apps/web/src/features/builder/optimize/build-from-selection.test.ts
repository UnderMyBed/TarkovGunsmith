import { describe, it, expect } from "vitest";
import type { BuildV6 } from "@tarkov/data";
import { buildFromSelection } from "./build-from-selection.js";
import { tinyTree } from "../../../test/tiny-tree.js";

const tree = tinyTree("w1", [
  { nameId: "muzzle", items: ["m-old", "m-new"] },
  {
    nameId: "handguard",
    items: [
      ["h-old", [{ nameId: "rail", items: ["r-old"] }]],
      ["h-new", [{ nameId: "rail", items: ["r-old", "r-new"] }]],
    ],
  },
  { nameId: "stock", items: ["s-keep"] },
  { nameId: "optic", items: ["o-new"] },
]);

const current: BuildV6 = {
  version: 6,
  weaponId: "w1",
  attachments: { muzzle: "m-old", handguard: "h-old", stock: "s-keep" },
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

const proposed: BuildV6 = {
  version: 6,
  weaponId: "w1",
  attachments: { muzzle: "m-new", handguard: "h-new", optic: "o-new" },
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

describe("buildFromSelection", () => {
  it("equals current build when nothing is selected", () => {
    const out = buildFromSelection(current, proposed, new Set(), tree);
    expect(out.attachments).toEqual(current.attachments);
  });

  it("applies every proposed change when all slots selected", () => {
    const out = buildFromSelection(
      current,
      proposed,
      new Set(["muzzle", "handguard", "optic"]),
      tree,
    );
    // stock stays because proposed dropped it; optic is a new addition from the proposal.
    expect(out.attachments).toEqual({
      muzzle: "m-new",
      handguard: "h-new",
      stock: "s-keep",
      optic: "o-new",
    });
  });

  it("applies only the selected slots (partial)", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle"]), tree);
    expect(out.attachments).toEqual({ muzzle: "m-new", handguard: "h-old", stock: "s-keep" });
  });

  it("removes a slot when selected and proposal drops it", () => {
    const current2: BuildV6 = { ...current, attachments: { muzzle: "m-old", handguard: "h-old" } };
    const proposed2: BuildV6 = { ...proposed, attachments: { muzzle: "m-new" } };
    const out = buildFromSelection(current2, proposed2, new Set(["handguard"]), tree);
    expect(out.attachments).toEqual({ muzzle: "m-old" });
  });

  it("drops what was beneath a replaced part", () => {
    const current3: BuildV6 = {
      ...current,
      attachments: { handguard: "h-old", "handguard/rail": "r-old" },
    };
    const proposed3: BuildV6 = { ...proposed, attachments: { handguard: "h-new" } };
    const out = buildFromSelection(current3, proposed3, new Set(["handguard"]), tree);
    expect(out.attachments).toEqual({ handguard: "h-new" });
  });

  it("applies a parent row before its child rows, whatever the selection order", () => {
    const proposed4: BuildV6 = {
      ...proposed,
      attachments: { handguard: "h-new", "handguard/rail": "r-new" },
    };
    const out = buildFromSelection(
      { ...current, attachments: { handguard: "h-old", "handguard/rail": "r-old" } },
      proposed4,
      new Set(["handguard/rail", "handguard"]),
      tree,
    );
    expect(out.attachments).toEqual({ handguard: "h-new", "handguard/rail": "r-new" });
  });

  it("writes no orphan key for a child row accepted without its parent row", () => {
    const proposed5: BuildV6 = {
      ...proposed,
      attachments: { handguard: "h-new", "handguard/rail": "r-new" },
    };
    // The current handguard's rail does not take r-new, and an empty handguard has no rail.
    expect(
      buildFromSelection(
        { ...current, attachments: { handguard: "h-old" } },
        proposed5,
        new Set(["handguard/rail"]),
        tree,
      ).attachments,
    ).toEqual({ handguard: "h-old" });
    expect(
      buildFromSelection(
        { ...current, attachments: {} },
        proposed5,
        new Set(["handguard/rail"]),
        tree,
      ).attachments,
    ).toEqual({});
  });

  it("preserves metadata (weaponId, orphaned, createdAt) from current", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle"]), tree);
    expect(out.weaponId).toBe(current.weaponId);
    expect(out.orphaned).toEqual(current.orphaned);
    expect(out.createdAt).toBe(current.createdAt);
    expect(out.version).toBe(6);
  });
});
