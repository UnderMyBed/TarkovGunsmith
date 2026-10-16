import type { AttachablePart } from "./queries/parts.js";

export interface AttachedPartEntry {
  /** Slot path the part occupies (the attachments-map key). */
  readonly path: string;
  readonly part: AttachablePart;
}

export interface AttachedParts {
  /** One entry per attachment, in attachments-map order. A part in two slots appears twice. */
  readonly entries: readonly AttachedPartEntry[];
  /** Attachments whose item id is not in the catalog (upstream removed or renamed it). */
  readonly missing: readonly { readonly path: string; readonly itemId: string }[];
}

/**
 * Resolve a build's attachments against the part catalog, one entry per slot.
 *
 * Stats, price and drift are all computed from this, per slot entry rather than over a
 * de-duplicated id set: a part fitted in two slots is two physical parts, so it counts twice
 * for weight, stats and price alike.
 */
export function attachedParts(
  attachments: Readonly<Record<string, string>>,
  byId: ReadonlyMap<string, AttachablePart>,
): AttachedParts {
  const entries: AttachedPartEntry[] = [];
  const missing: { path: string; itemId: string }[] = [];
  for (const [path, itemId] of Object.entries(attachments)) {
    const part = byId.get(itemId);
    if (part === undefined) missing.push({ path, itemId });
    else entries.push({ path, part });
  }
  return { entries, missing };
}

/** The flea-market price of one part in RUB, or 0 when it has no flea offer. */
export function fleaPriceRub(part: AttachablePart): number {
  return (part.buyFor ?? []).find((b) => b.vendor.__typename === "FleaMarket")?.priceRUB ?? 0;
}
