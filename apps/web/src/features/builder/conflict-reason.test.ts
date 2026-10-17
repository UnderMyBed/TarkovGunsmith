import { describe, expect, it } from "vitest";
import { partsById, type AttachablePart } from "@tarkov/data";
import { conflictReasonFor, fittedConflictReasonFor } from "./conflict-reason.js";
import { tinyTree } from "../../test/tiny-tree.js";

function part(id: string, shortName: string, conflictingItems: string[] = []): AttachablePart {
  return {
    id,
    name: id,
    shortName,
    iconLink: "https://assets.tarkov.dev/x.webp",
    weight: 0.1,
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
    conflictingItems,
    conflictingSlotIds: [],
  };
}

const tree = tinyTree("w", [
  { nameId: "mod_handguard", items: ["hg"] },
  { nameId: "mod_barrel", items: ["brl"] },
  { nameId: "mod_stock", items: ["stk"] },
]);
const parts = partsById([
  part("hg", "AX-15", ["brl", "stk"]),
  part("brl", '10.3"'),
  part("stk", "CTR"),
]);

describe("conflictReasonFor", () => {
  it("names the fitted part the candidate clashes with, from either side's list", () => {
    const reason = conflictReasonFor(tree, { mod_handguard: "hg" }, parts);
    // `brl` does not list `hg`; `hg` lists `brl`. Either direction is a conflict.
    expect(reason("mod_barrel", "brl")).toBe("Conflicts with AX-15");
  });

  it("counts further clashes after the first", () => {
    const reason = conflictReasonFor(tree, { mod_barrel: "brl", mod_stock: "stk" }, parts);
    expect(reason("mod_handguard", "hg")).toBe('Conflicts with 10.3" +1');
  });

  it("is null when nothing clashes", () => {
    expect(conflictReasonFor(tree, {}, parts)("mod_handguard", "hg")).toBeNull();
  });
});

describe("fittedConflictReasonFor", () => {
  const conflict = (aPath: string, aId: string, bPath: string, bId: string) => ({
    kind: "item" as const,
    a: { path: aPath, itemId: aId },
    b: { path: bPath, itemId: bId },
  });
  const nameOf = (id: string) => parts.get(id)?.shortName ?? id;

  it("names the other part on both sides of a clash, and a count past the first", () => {
    const reason = fittedConflictReasonFor(
      [
        conflict("mod_handguard", "hg", "mod_barrel", "brl"),
        conflict("mod_handguard", "hg", "mod_stock", "stk"),
      ],
      nameOf,
    );
    expect(reason("mod_handguard")).toBe('Conflicts with 10.3" +1');
    expect(reason("mod_barrel")).toBe("Conflicts with AX-15");
    expect(reason("mod_stock")).toBe("Conflicts with AX-15");
  });

  it("is null for a part that clashes with nothing", () => {
    expect(fittedConflictReasonFor([], nameOf)("mod_barrel")).toBeNull();
  });
});
