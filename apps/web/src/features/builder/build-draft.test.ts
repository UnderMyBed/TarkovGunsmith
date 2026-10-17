// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  DRAFT_KEY,
  DRAFT_MAX_CHARS,
  parseDraft,
  readDraft,
  serializeDraft,
  sharedDraftKey,
  SHARED_DRAFTS_KEPT,
  writeDraft,
  type DraftBuild,
} from "./build-draft.js";

const DRAFT: DraftBuild = {
  weaponId: "w-m4a1",
  attachments: { mod_muzzle: "mod-muzzle" },
  orphaned: ["mod-gone"],
  name: "  Night raid  ",
  description: "",
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("draft round trip", () => {
  it("stores the build as a current-version payload and reads it back", () => {
    writeDraft(DRAFT_KEY, DRAFT, Date.UTC(2026, 9, 16));
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "") as Record<string, unknown>;
    expect(stored).toMatchObject({ draft: 1, writtenAt: Date.UTC(2026, 9, 16) });

    expect(readDraft(DRAFT_KEY)).toEqual({
      version: 6,
      weaponId: "w-m4a1",
      attachments: { mod_muzzle: "mod-muzzle" },
      orphaned: ["mod-gone"],
      createdAt: "2026-10-16T00:00:00.000Z",
      name: "Night raid",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps more orphans than a share may carry", () => {
    const orphaned = Array.from({ length: 100 }, (_, i) => `gone-${i}`);
    writeDraft(DRAFT_KEY, { ...DRAFT, orphaned });
    expect(readDraft(DRAFT_KEY)).toMatchObject({ orphaned });
  });

  it("reads a draft whose build is an older version, for the migrations to bring up", () => {
    const raw = JSON.stringify({
      draft: 1,
      writtenAt: 1,
      build: {
        version: 2,
        weaponId: "w-m4a1",
        attachments: { mod_muzzle: "mod-muzzle" },
        orphaned: [],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(parseDraft(DRAFT_KEY, raw)).toMatchObject({ version: 2, weaponId: "w-m4a1" });
  });

  it("does not keep a draft without a weapon, and removes the one there", () => {
    writeDraft(DRAFT_KEY, DRAFT);
    writeDraft(DRAFT_KEY, { ...DRAFT, weaponId: "" });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("clears a draft", () => {
    writeDraft(DRAFT_KEY, DRAFT);
    clearDraft(DRAFT_KEY);
    expect(readDraft(DRAFT_KEY)).toBeNull();
  });
});

describe("unreadable drafts", () => {
  it("reads no draft as null, silently", () => {
    expect(readDraft(DRAFT_KEY)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{nope"],
    ["another envelope version", JSON.stringify({ draft: 2, writtenAt: 1, build: {} })],
    [
      "a build that does not parse",
      serializeDraft(DRAFT, 1).replace('"version":6', '"version":99'),
    ],
    ["a bare build without the envelope", JSON.stringify({ version: 6, weaponId: "w" })],
    ["over the size limit", "x".repeat(DRAFT_MAX_CHARS + 1)],
  ])("falls back to no draft for %s, with one warning, and leaves the value", (_, raw) => {
    localStorage.setItem(DRAFT_KEY, raw);
    expect(readDraft(DRAFT_KEY)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(raw);
  });

  it("treats storage that throws as no draft, and a failed write as unsaved", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(readDraft(DRAFT_KEY)).toBeNull();
    expect(() => writeDraft(DRAFT_KEY, DRAFT)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("shared-build drafts", () => {
  it("keep the most recently written few, evicting the oldest", () => {
    for (let i = 0; i < SHARED_DRAFTS_KEPT + 2; i++) {
      writeDraft(sharedDraftKey(`id${i}`), DRAFT, 1000 + i);
    }
    const kept = Object.keys(localStorage).filter((k) => k.startsWith(`${DRAFT_KEY}:`));
    expect(kept.sort()).toEqual([2, 3, 4, 5, 6].map((i) => sharedDraftKey(`id${i}`)).sort());
  });

  it("never evict the /builder draft", () => {
    writeDraft(DRAFT_KEY, DRAFT, 1);
    for (let i = 0; i < SHARED_DRAFTS_KEPT + 1; i++) {
      writeDraft(sharedDraftKey(`id${i}`), DRAFT, 1000 + i);
    }
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });
});
