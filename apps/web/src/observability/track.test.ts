import { afterEach, describe, expect, it, vi } from "vitest";
import type { OptimizationResult } from "@tarkov/optimizer";
import {
  PENDING_LIMIT,
  connectTracking,
  optimizerRunAttrs,
  resetTrackingForTests,
  track,
} from "./track.js";

afterEach(() => resetTrackingForTests());

describe("track", () => {
  it("sends each event with string attributes once Faro is connected", () => {
    const sink = vi.fn();
    connectTracking(sink);
    track("weapon_selected", { weaponId: "5447a9cd4bdc2dbd208b4567" });
    track("build_shared");
    track("optimizer_run", { objective: "min-recoil", outcome: "ok", ms: 412, exact: true });
    expect(sink.mock.calls).toEqual([
      ["weapon_selected", { weaponId: "5447a9cd4bdc2dbd208b4567" }],
      ["build_shared", {}],
      ["optimizer_run", { objective: "min-recoil", outcome: "ok", ms: "412", exact: "true" }],
    ]);
  });

  it("keeps events sent before Faro loads and delivers them in order when it connects", () => {
    track("build_loaded", { source: "draft" });
    track("compare_opened");
    const sink = vi.fn();
    connectTracking(sink);
    expect(sink.mock.calls).toEqual([
      ["build_loaded", { source: "draft" }],
      ["compare_opened", {}],
    ]);
  });

  it("keeps at most PENDING_LIMIT events before Faro loads", () => {
    for (let i = 0; i < PENDING_LIMIT + 10; i++) track("compare_opened");
    const sink = vi.fn();
    connectTracking(sink);
    expect(sink).toHaveBeenCalledTimes(PENDING_LIMIT);
  });

  it("keeps nothing once Faro is ruled out on this page", () => {
    track("mode_changed", { mode: "progression" });
    connectTracking(null);
    track("mode_changed", { mode: "theorycraft" });
    // A sink connected later (it never is, in the app) sees nothing that was dropped.
    const sink = vi.fn();
    connectTracking(sink);
    expect(sink).not.toHaveBeenCalled();
  });
});

describe("optimizerRunAttrs", () => {
  const ok = { ok: true } as unknown as OptimizationResult;
  const failure = (reason: string) => ({ ok: false, reason, message: "" }) as OptimizationResult;

  it("maps a result to ok, exact", () => {
    expect(optimizerRunAttrs("min-recoil", ok, 412.6)).toEqual({
      objective: "min-recoil",
      outcome: "ok",
      ms: 413,
      exact: true,
    });
  });

  it.each([
    ["weapon-unavailable", "infeasible-weapon-unavailable"],
    ["required-slot", "infeasible-required-slot"],
    ["pin-conflict", "infeasible-pin-conflict"],
    ["infeasible-budget", "infeasible-budget"],
    ["pinned-unpriced", "infeasible-pinned-unpriced"],
    ["no-valid-combinations", "infeasible-no-valid-combinations"],
  ])("maps the typed failure %s to %s, exact", (reason, outcome) => {
    expect(optimizerRunAttrs("max-ergonomics", failure(reason), 10)).toMatchObject({
      outcome,
      exact: true,
    });
  });

  it("marks a timeout, a cancel, an abandoned run and a worker error as not exact", () => {
    expect(optimizerRunAttrs("min-weight", failure("timeout"), 2000)).toMatchObject({
      outcome: "timeout",
      exact: false,
    });
    expect(optimizerRunAttrs("min-weight", "cancelled", 5)).toMatchObject({
      outcome: "cancelled",
      exact: false,
    });
    expect(optimizerRunAttrs("min-recoil", "abandoned", 5)).toMatchObject({
      outcome: "abandoned",
      exact: false,
    });
    expect(optimizerRunAttrs("max-accuracy", "error", 5)).toMatchObject({
      outcome: "error",
      exact: false,
    });
  });
});
