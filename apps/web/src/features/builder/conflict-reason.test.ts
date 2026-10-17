import { describe, expect, it } from "vitest";
import { partsById, type AttachablePart } from "@tarkov/data";
import { conflictReasonFor } from "./conflict-reason.js";
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
