import { describe, expect, it } from "vitest";
import { tinyTree } from "../../test/tiny-tree.js";
import { flattenProposalSlots, flattenVisibleSlots, resolveSelection } from "./slot-selection.js";

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
      ["upper-2", [{ nameId: "mod_scope", items: ["optic"] }]],
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

describe("flattenProposalSlots", () => {
  const current = { mod_reciever: "upper", "mod_reciever/mod_barrel": "barrel" };

  it("is the current build's rows when nothing is proposed differently", () => {
    expect(flattenProposalSlots(TREE, current, current)).toEqual(
      flattenVisibleSlots(TREE, current),
    );
  });

  it("shows the slots of both parts where the builds differ, the current part's first", () => {
    const rows = flattenProposalSlots(TREE, current, { mod_reciever: "upper-2" });
    expect(rows.map((r) => [r.slot.path, r.level, r.parentPath])).toEqual([
      ["mod_reciever", 1, null],
      ["mod_reciever/mod_barrel", 2, "mod_reciever"],
      ["mod_reciever/mod_barrel/mod_muzzle", 3, "mod_reciever/mod_barrel"],
      ["mod_reciever/mod_handguard", 2, "mod_reciever"],
      ["mod_reciever/mod_scope", 2, "mod_reciever"],
      ["mod_stock", 1, null],
    ]);
  });

  it("shows a slot only the proposal fills", () => {
    const rows = flattenProposalSlots(TREE, { mod_reciever: "upper" }, current);
    expect(rows.map((r) => r.slot.path)).toContain("mod_reciever/mod_barrel/mod_muzzle");
  });
  it("finds each build's part in that build's own slot where two parents share a child path", () => {
    // Both handguards have a lower-handguard slot at the same path, but they are different slots
    // (ids `h-old:lower` and `h-new:lower`), and only the new one takes the new lower handguard.
    const tree = tinyTree("w", [
      {
        nameId: "hg",
        items: [
          ["h-old", [{ nameId: "lower", items: ["l-old"] }]],
          ["h-new", [{ nameId: "lower", items: [["l-new", [{ nameId: "grip", items: ["g"] }]]] }]],
        ],
      },
    ]);
    const rows = flattenProposalSlots(
      tree,
      { hg: "h-old", "hg/lower": "l-old" },
      { hg: "h-new", "hg/lower": "l-new", "hg/lower/grip": "g" },
    );
    expect(rows.map((r) => [r.slot.path, r.level, r.parentPath, r.hasChildren])).toEqual([
      ["hg", 1, null, true],
      ["hg/lower", 2, "hg", true],
      ["hg/lower/grip", 3, "hg/lower", false],
    ]);
    // The row shows the current part's slot first, as it does for every shared path.
    expect(rows[1]!.slot.id).toBe("h-old:lower");
  });
});
