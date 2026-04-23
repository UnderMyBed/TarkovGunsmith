import { describe, it, expect } from "vitest";
import type { BuildV4 } from "@tarkov/data";
import { buildFromSelection } from "./build-from-selection.js";

const current: BuildV4 = {
  version: 4,
  weaponId: "w1",
  attachments: { muzzle: "m-old", handguard: "h-old", stock: "s-keep" },
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

const proposed: BuildV4 = {
  version: 4,
  weaponId: "w1",
  attachments: { muzzle: "m-new", handguard: "h-new", optic: "o-new" },
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

describe("buildFromSelection", () => {
  it("equals current build when nothing is selected", () => {
    const out = buildFromSelection(current, proposed, new Set());
    expect(out.attachments).toEqual(current.attachments);
  });

  it("applies every proposed change when all slots selected", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle", "handguard", "optic"]));
    // stock stays because proposed dropped it; optic is a new addition from the proposal.
    expect(out.attachments).toEqual({
      muzzle: "m-new",
      handguard: "h-new",
      stock: "s-keep",
      optic: "o-new",
    });
  });

  it("applies only the selected slots (partial)", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle"]));
    expect(out.attachments).toEqual({ muzzle: "m-new", handguard: "h-old", stock: "s-keep" });
  });

  it("removes a slot when selected and proposal drops it", () => {
    const current2: BuildV4 = { ...current, attachments: { muzzle: "m-old", handguard: "h-old" } };
    const proposed2: BuildV4 = { ...proposed, attachments: { muzzle: "m-new" } };
    const out = buildFromSelection(current2, proposed2, new Set(["handguard"]));
    expect(out.attachments).toEqual({ muzzle: "m-old" });
  });

  it("preserves metadata (weaponId, orphaned, createdAt) from current", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle"]));
    expect(out.weaponId).toBe(current.weaponId);
    expect(out.orphaned).toEqual(current.orphaned);
    expect(out.createdAt).toBe(current.createdAt);
    expect(out.version).toBe(4);
  });
});
