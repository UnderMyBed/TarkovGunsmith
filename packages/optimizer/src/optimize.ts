import type { BuildV4 } from "@tarkov/data";
import { branchAndBound } from "./branch-and-bound.js";
import type { OptimizationInput, OptimizationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Top-level entry point. Wraps the B&B DFS with timeout accounting and
 * translates to the typed `OptimizationResult` shape.
 */
export function optimize(input: OptimizationInput): OptimizationResult {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let aborted = false;

  const best = branchAndBound(
    {
      weapon: input.weapon,
      modList: input.modList,
      profile: input.constraints.profile,
      pinnedSlots: input.constraints.pinnedSlots,
      objective: input.objective,
      budgetRub: input.constraints.budgetRub,
      deadline,
      onNodeVisit: () => {
        if (Date.now() >= deadline) {
          aborted = true;
          return false;
        }
        return true;
      },
    },
    input.slotTree.slots,
  );

  // Also check the deadline post-hoc — a fast-finishing search may never
  // have triggered the periodic onNodeVisit callback yet still overran.
  if (!aborted && Date.now() >= deadline) {
    aborted = true;
  }

  if (best === null) {
    return {
      ok: false,
      reason: aborted ? "timeout" : "no-valid-combinations",
    };
  }

  // Pure function: no clock-derived field in the returned build. Callers
  // that want a real timestamp stamp it themselves.
  const build: BuildV4 = {
    version: 4,
    weaponId: input.weapon.id,
    attachments: { ...best.attachments },
    orphaned: [],
    createdAt: "1970-01-01T00:00:00.000Z",
  };

  return {
    ok: true,
    build,
    stats: best.stats,
    ...(aborted ? { partial: true } : {}),
  };
}
