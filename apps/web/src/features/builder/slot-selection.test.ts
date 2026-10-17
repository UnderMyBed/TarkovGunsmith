import { describe, expect, it } from "vitest";
import { tinyTree } from "../../test/tiny-tree.js";
import { flattenVisibleSlots, resolveSelection } from "./slot-selection.js";

const TREE = tinyTree("w", [
  {
    nameId: "mod_reciever",
    items: [
      [
        "upper",
        [
          {
            nameId: "mod_barrel",
            items: [["barrel", [{ nameId: "mod_muzzle", items: ["brake"] }]]],
          },
          { nameId: "mod_handguard", items: ["rail"] },
        ],
      ],
    ],
  },
  { nameId: "mod_stock", items: ["stock"] },
]);

const paths = (attachments: Record<string, string>) =>
  flattenVisibleSlots(TREE, attachments).map((r) => r.slot.path);

describe("flattenVisibleSlots", () => {
  it("lists only the weapon's own slots while nothing is fitted", () => {
    expect(paths({})).toEqual(["mod_reciever", "mod_stock"]);
  });

  it("puts a fitted part's slots right after its row, depth first", () => {
    const rows = flattenVisibleSlots(TREE, {
      mod_reciever: "upper",
      "mod_reciever/mod_barrel": "barrel",
    });
    expect(rows.map((r) => [r.slot.path, r.level, r.parentPath, r.hasChildren])).toEqual([
      ["mod_reciever", 1, null, true],
      ["mod_reciever/mod_barrel", 2, "mod_reciever", true],
      ["mod_reciever/mod_barrel/mod_muzzle", 3, "mod_reciever/mod_barrel", false],
      ["mod_reciever/mod_handguard", 2, "mod_reciever", false],
      ["mod_stock", 1, null, false],
    ]);
    expect(rows[1]).toMatchObject({ posInSet: 1, setSize: 2 });
    expect(rows[3]).toMatchObject({ posInSet: 2, setSize: 2 });
  });

  it("ignores an attachment no slot on the tree takes", () => {
    expect(paths({ mod_reciever: "not-allowed" })).toEqual(["mod_reciever", "mod_stock"]);
  });
});

describe("resolveSelection", () => {
  const rows = flattenVisibleSlots(TREE, { mod_reciever: "upper" });

  it("keeps the slot asked for while it is on the tree", () => {
    expect(resolveSelection(rows, "mod_reciever/mod_handguard")?.slot.path).toBe(
      "mod_reciever/mod_handguard",
    );
  });

  it("falls back to the nearest ancestor still on the tree", () => {
    expect(resolveSelection(rows, "mod_reciever/mod_barrel/mod_muzzle")?.slot.path).toBe(
      "mod_reciever/mod_barrel",
    );
    expect(resolveSelection(rows, "mod_stock/mod_stock_000")?.slot.path).toBe("mod_stock");
  });

  it("starts on the first slot, and has nothing to select on a weapon with no slots", () => {
    expect(resolveSelection(rows, null)?.slot.path).toBe("mod_reciever");
    expect(resolveSelection(rows, "elsewhere")?.slot.path).toBe("mod_reciever");
    expect(resolveSelection([], "mod_reciever")).toBeNull();
  });
});
