import type { Progression } from "@tarkov/data";
import type { Objective, OptimizationResult } from "@tarkov/optimizer";

/**
 * How an optimizer run ended. `infeasible-*` is the solver's typed failure reason;
 * `error` is a worker that crashed or could not be reached.
 */
export type OptimizerOutcome = "ok" | "timeout" | "cancelled" | "error" | `infeasible-${string}`;

export interface OptimizerRunAttrs {
  readonly objective: Objective;
  readonly outcome: OptimizerOutcome;
  /** Wall-clock milliseconds from Run to the outcome, rounded. */
  readonly ms: number;
  /** Whether the search finished: true for a result or a proven failure. */
  readonly exact: boolean;
}

/**
 * Every custom event the site sends, with its attributes. Nothing here may carry personal
 * data: no build names or notes, no TarkovTracker token or profile, no user id.
 */
export interface TrackEvents {
  weapon_selected: { readonly weaponId: string };
  mode_changed: { readonly mode: Progression["mode"] };
  optimizer_run: OptimizerRunAttrs;
  build_shared: undefined;
  build_loaded: { readonly source: "link" | "draft" };
  compare_opened: undefined;
}

export type TrackEvent = keyof TrackEvents;

type TrackArgs<E extends TrackEvent> = TrackEvents[E] extends undefined ? [] : [TrackEvents[E]];

/** Where events go once Faro has started: its `api.pushEvent`. */
export type EventSink = (name: string, attributes: Record<string, string>) => void;

/** Events sent before Faro has loaded wait here, up to this many; later ones are dropped. */
export const PENDING_LIMIT = 50;

interface Pending {
  readonly name: string;
  readonly attributes: Record<string, string>;
}

/** `undefined` until Faro starts or is ruled out, then the sink or `null`. */
let sink: EventSink | null | undefined;
let pending: Pending[] = [];

/** Records one event. Faro event attributes are strings, so every value is stringified. */
export function track<E extends TrackEvent>(event: E, ...args: TrackArgs<E>): void {
  const attrs = (args[0] ?? {}) as Record<string, string | number | boolean>;
  const attributes = Object.fromEntries(
    Object.entries(attrs).map(([key, value]) => [key, String(value)]),
  );
  if (sink === null) return;
  if (sink === undefined) {
    if (pending.length < PENDING_LIMIT) pending.push({ name: event, attributes });
    return;
  }
  sink(event, attributes);
}

/**
 * Hands events to Faro once it has started, sending the ones that waited, or, with `null`,
 * records that it will not start on this page so nothing is kept.
 */
export function connectTracking(next: EventSink | null): void {
  sink = next;
  const waiting = pending;
  pending = [];
  if (next !== null) for (const { name, attributes } of waiting) next(name, attributes);
}

/** Back to the state at page load. Tests only. */
export function resetTrackingForTests(): void {
  sink = undefined;
  pending = [];
}

/** The `optimizer_run` attributes for a run that ended in `ending` after `ms`. */
export function optimizerRunAttrs(
  objective: Objective,
  ending: OptimizationResult | "cancelled" | "error",
  ms: number,
): OptimizerRunAttrs {
  const outcome: OptimizerOutcome =
    ending === "cancelled" || ending === "error"
      ? ending
      : ending.ok
        ? "ok"
        : ending.reason === "timeout"
          ? "timeout"
          : `infeasible-${ending.reason.replace(/^infeasible-/, "")}`;
  const exact = outcome === "ok" || outcome.startsWith("infeasible-");
  return { objective, outcome, ms: Math.round(ms), exact };
}
