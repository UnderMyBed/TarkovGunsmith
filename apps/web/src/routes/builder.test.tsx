// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useState } from "react";
import { useV1Migration } from "./builder.js";
import type { SlotNodeForMigration } from "@tarkov/data";

afterEach(() => cleanup());

const treeA: readonly SlotNodeForMigration[] = [
  {
    nameId: "muzzle",
    path: "muzzle",
    allowedItemIds: new Set(["mod-a"]),
    children: [],
  },
];

// A second, differently-shaped tree. Used to prove migration runs at most once: if the
// `migrated` guard were ever lost, a later prop change would silently re-migrate against
// stale initialModIds and clobber whatever the user has since attached.
const treeB: readonly SlotNodeForMigration[] = [
  {
    nameId: "muzzle",
    path: "muzzle",
    allowedItemIds: new Set(["mod-z"]),
    children: [],
  },
];

interface HarnessProps {
  modIds: string[] | undefined;
  treeSlots: readonly SlotNodeForMigration[] | undefined;
}

function useHarness({ modIds, treeSlots }: HarnessProps) {
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const [orphaned, setOrphaned] = useState<string[]>([]);
  useV1Migration("w1", modIds, treeSlots, setAttachments, setOrphaned);
  return { attachments, orphaned };
}

describe("useV1Migration", () => {
  it("does not migrate while the weapon tree has not loaded yet", () => {
    const { result } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-a"], treeSlots: undefined },
    });
    expect(result.current.attachments).toEqual({});
    expect(result.current.orphaned).toEqual([]);
  });

  it("migrates attachments as soon as the tree becomes available", () => {
    const { result, rerender } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-a"], treeSlots: undefined },
    });
    rerender({ modIds: ["mod-a"], treeSlots: treeA });
    expect(result.current.attachments).toEqual({ muzzle: "mod-a" });
    expect(result.current.orphaned).toEqual([]);
  });

  it("migrates orphaned mods that don't match any slot", () => {
    const { result, rerender } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-unknown"], treeSlots: undefined },
    });
    rerender({ modIds: ["mod-unknown"], treeSlots: treeA });
    expect(result.current.attachments).toEqual({});
    expect(result.current.orphaned).toEqual(["mod-unknown"]);
  });

  it("migrates exactly once — a later tree change does not re-run it", () => {
    // Regression test for the guard itself: without `migrated` gating the render-time
    // check, every render where `initialModIds && treeSlots` are both still truthy would
    // re-run the migration and stomp the attachments the user has since edited.
    const { result, rerender } = renderHook(useHarness, {
      initialProps: { modIds: ["mod-a"], treeSlots: undefined },
    });
    rerender({ modIds: ["mod-a"], treeSlots: treeA });
    expect(result.current.attachments).toEqual({ muzzle: "mod-a" });

    rerender({ modIds: ["mod-a"], treeSlots: treeB });
    // Still the treeA result — treeB's mapping (mod-z, not mod-a) never got applied.
    expect(result.current.attachments).toEqual({ muzzle: "mod-a" });
  });

  it("does nothing when there are no v1 modIds to migrate", () => {
    const { result } = renderHook(useHarness, {
      initialProps: { modIds: undefined, treeSlots: treeA },
    });
    expect(result.current.attachments).toEqual({});
  });
});
