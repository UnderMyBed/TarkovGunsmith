import { describe, it, expect } from "vitest";
import { compareDraftReducer, initialDraft } from "./useCompareDraft.js";
import type { BuildV4, PlayerProfile } from "@tarkov/data";

const build: BuildV4 = {
  version: 4,
  weaponId: "w1",
  attachments: {},
  orphaned: [],
  createdAt: "2026-04-20T00:00:00.000Z",
};

const profile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 1,
    therapist: 1,
    skier: 1,
    peacekeeper: 1,
    mechanic: 1,
    ragman: 1,
    jaeger: 1,
  },
  flea: false,
};

describe("compareDraftReducer", () => {
  it("initial state is blank and not dirty", () => {
    expect(initialDraft.left).toBeNull();
    expect(initialDraft.right).toBeNull();
    expect(initialDraft.dirty).toBe(false);
  });

  it("SET_SIDE replaces one side and marks dirty", () => {
    const next = compareDraftReducer(initialDraft, {
      type: "SET_SIDE",
      side: "left",
      build,
    });
    expect(next.left).toEqual(build);
    expect(next.right).toBeNull();
    expect(next.dirty).toBe(true);
  });

  it("SWAP exchanges both sides and their profiles", () => {
    const state: typeof initialDraft = {
      ...initialDraft,
      left: build,
      right: { ...build, weaponId: "w2" },
      leftProfile: profile,
    };
    const next = compareDraftReducer(state, { type: "SWAP" });
    expect(next.left?.weaponId).toBe("w2");
    expect(next.right?.weaponId).toBe("w1");
    expect(next.rightProfile).toEqual(profile);
    expect(next.leftProfile).toBeUndefined();
  });

  it("CLONE from:left copies to right by value", () => {
    const state = { ...initialDraft, left: build };
    const next = compareDraftReducer(state, { type: "CLONE", from: "left" });
    expect(next.right).toEqual(build);
    expect(next.right).not.toBe(next.left);
  });

  it("CLONE from:left is a no-op when left is null", () => {
    const next = compareDraftReducer(initialDraft, { type: "CLONE", from: "left" });
    expect(next).toBe(initialDraft);
  });

  it("SET_PROFILE sets per-side profile and dirty", () => {
    const next = compareDraftReducer(initialDraft, {
      type: "SET_PROFILE",
      side: "right",
      profile,
    });
    expect(next.rightProfile).toEqual(profile);
    expect(next.leftProfile).toBeUndefined();
    expect(next.dirty).toBe(true);
  });

  it("LOAD_FROM_PAIR hydrates from v1 pair and clears dirty", () => {
    const dirtyState = { ...initialDraft, left: build, dirty: true };
    const next = compareDraftReducer(dirtyState, {
      type: "LOAD_FROM_PAIR",
      pair: {
        v: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        left: build,
        right: build,
        name: "hello",
      },
    });
    expect(next.left).toEqual(build);
    expect(next.right).toEqual(build);
    expect(next.name).toBe("hello");
    expect(next.dirty).toBe(false);
  });

  it("SET_NAME marks dirty", () => {
    const next = compareDraftReducer(initialDraft, {
      type: "SET_NAME",
      name: "my pair",
    });
    expect(next.name).toBe("my pair");
    expect(next.dirty).toBe(true);
  });

  it("SET_DESCRIPTION marks dirty", () => {
    const next = compareDraftReducer(initialDraft, {
      type: "SET_DESCRIPTION",
      description: "thoughts",
    });
    expect(next.description).toBe("thoughts");
    expect(next.dirty).toBe(true);
  });

  it("RESET returns to initial state", () => {
    const state = { ...initialDraft, left: build, name: "x", dirty: true };
    expect(compareDraftReducer(state, { type: "RESET" })).toEqual(initialDraft);
  });

  it("MARK_CLEAN clears dirty", () => {
    const state = { ...initialDraft, dirty: true };
    const next = compareDraftReducer(state, { type: "MARK_CLEAN" });
    expect(next.dirty).toBe(false);
  });
});
