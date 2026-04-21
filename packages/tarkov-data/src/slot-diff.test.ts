import { describe, it, expect } from "vitest";
import { slotDiff, type SlotDiffStatus, type SlotDiffInput } from "./slot-diff.js";

function leaf(nameId: string): SlotDiffInput["tree"][number] {
  return { nameId, path: nameId, children: [] } as unknown as SlotDiffInput["tree"][number];
}

const tree = [leaf("mod_scope"), leaf("mod_barrel"), leaf("mod_stock")];

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

  it("recurses into nested slot children", () => {
    const nested = [
      {
        nameId: "mod_mount",
        path: "mod_mount",
        children: [{ nameId: "mod_scope", path: "mod_mount/mod_scope", children: [] }],
      },
    ] as unknown as SlotDiffInput["tree"];

    const map = slotDiff(
      { tree: nested, attachments: { "mod_mount/mod_scope": "x" } },
      { tree: nested, attachments: {} },
    );
    expect(map.get("mod_mount/mod_scope")).toBe<SlotDiffStatus>("left-only");
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
