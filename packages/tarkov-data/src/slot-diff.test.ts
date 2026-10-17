import { describe, it, expect } from "vitest";
import { slotDiff, type SlotDiffStatus } from "./slot-diff.js";
import { tinyTree } from "./__test-utils__/tiny-tree.js";

const tree = tinyTree("w", [
  { nameId: "mod_scope", items: ["x", "y"] },
  { nameId: "mod_barrel", items: ["y"] },
  { nameId: "mod_stock", items: [] },
]);

describe("slotDiff", () => {
  it("returns all 'equal' when attachments match", () => {
    const map = slotDiff(
      { tree, attachments: { mod_scope: "x", mod_barrel: "y" } },
      { tree, attachments: { mod_scope: "x", mod_barrel: "y" } },
    );
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("equal");
    expect(map.get("mod_barrel")).toBe<SlotDiffStatus>("equal");
    expect(map.get("mod_stock")).toBe<SlotDiffStatus>("equal");
  });

  it("marks 'differs' when same slot has different items", () => {
    const map = slotDiff(
      { tree, attachments: { mod_scope: "x" } },
      { tree, attachments: { mod_scope: "y" } },
    );
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("differs");
  });

  it("marks 'left-only' when left has an item and right is empty", () => {
    const map = slotDiff({ tree, attachments: { mod_scope: "x" } }, { tree, attachments: {} });
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("left-only");
  });

  it("marks 'right-only' when right has an item and left is empty", () => {
    const map = slotDiff({ tree, attachments: {} }, { tree, attachments: { mod_scope: "y" } });
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("right-only");
  });

  it("covers the slots of attached items, at any depth", () => {
    const nested = tinyTree("w", [
      { nameId: "mod_mount", items: [["m", [{ nameId: "mod_scope", items: ["x"] }]]] },
    ]);

    const map = slotDiff(
      { tree: nested, attachments: { mod_mount: "m", "mod_mount/mod_scope": "x" } },
      { tree: nested, attachments: { mod_mount: "m" } },
    );
    expect(map.get("mod_mount")).toBe<SlotDiffStatus>("equal");
    expect(map.get("mod_mount/mod_scope")).toBe<SlotDiffStatus>("left-only");
  });

  it("lists a child slot when either side shows it", () => {
    const nested = tinyTree("w", [
      { nameId: "mod_mount", items: [["m", [{ nameId: "mod_scope", items: ["x"] }]]] },
    ]);
    const map = slotDiff(
      { tree: nested, attachments: { mod_mount: "m" } },
      { tree: nested, attachments: {} },
    );
    expect(map.get("mod_mount/mod_scope")).toBe<SlotDiffStatus>("equal");
    expect(map.get("mod_mount")).toBe<SlotDiffStatus>("left-only");
  });

  it("handles null sides gracefully", () => {
    const map = slotDiff(null, { tree, attachments: { mod_scope: "x" } });
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("right-only");
  });

  it("returns empty map when both sides are null", () => {
    const map = slotDiff(null, null);
    expect(map.size).toBe(0);
  });
});
