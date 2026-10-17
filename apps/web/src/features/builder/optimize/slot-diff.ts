import {
  adaptMod,
  mountedAttachments,
  priceUnder,
  visibleSlots,
  type AttachablePart,
  type PriceGate,
  type SlotNode,
  type WeaponTree,
} from "@tarkov/data";

export interface ChangedRow {
  readonly slotId: string;
  readonly slotLabel: string;
  readonly currentName: string | null;
  readonly proposedName: string | null;
  readonly currentErgo: number;
  readonly currentRecoil: number;
  /** `null` when the part's price under the gate is not known; `0` for an empty slot. */
  readonly currentPrice: number | null;
  readonly proposedErgo: number;
  readonly proposedRecoil: number;
  readonly proposedPrice: number | null;
  readonly ergoDelta: number;
  /**
   * Difference of two `recoilModifier` values, so it carries upstream's
   * fractional unit: -0.22 means 22 percentage points less recoil. Renderers
   * scale by 100 — see mod-changes-table.tsx.
   */
  readonly recoilDelta: number;
  /** `null` when either price is not known. */
  readonly priceDelta: number | null;
}

interface ModStats {
  readonly name: string | null;
  readonly ergo: number;
  readonly recoil: number;
  readonly price: number | null;
}

function lookupMod(
  id: string | undefined,
  parts: ReadonlyMap<string, AttachablePart>,
  gate: PriceGate,
): ModStats {
  if (id === undefined) return { name: null, ergo: 0, recoil: 0, price: 0 };
  const m = parts.get(id);
  if (m === undefined) return { name: id, ergo: 0, recoil: 0, price: null };
  const stats = adaptMod(m);
  return {
    name: m.name,
    ergo: stats.ergonomicsDelta,
    recoil: stats.recoilModifier,
    price: priceUnder(gate, m),
  };
}

/** Every slot either build shows, current build's first, each path once. */
export function shownSlots(
  slotTree: WeaponTree,
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
): SlotNode[] {
  const seen = new Set<string>();
  return [...visibleSlots(slotTree, current), ...visibleSlots(slotTree, proposed)].filter(
    (slot) => !seen.has(slot.path) && seen.add(slot.path),
  );
}

/**
 * One row per slot whose part differs between the two builds, in slot order. Only parts on the
 * weapon are compared ({@link mountedAttachments}): a stale key beneath a removed or replaced
 * part is not a change anyone could accept.
 */
export function slotDiff(
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
  slotTree: WeaponTree,
  parts: ReadonlyMap<string, AttachablePart>,
  gate: PriceGate,
): readonly ChangedRow[] {
  const currentOn = mountedAttachments(slotTree, current, parts);
  const proposedOn = mountedAttachments(slotTree, proposed, parts);
  const rows: ChangedRow[] = [];
  // Every slot either build shows, so a change deep under a barrel or handguard gets its real
  // slot name.
  for (const slot of shownSlots(slotTree, currentOn, proposedOn)) {
    const c = currentOn[slot.path];
    const p = proposedOn[slot.path];
    if (c === p) continue;
    const cm = lookupMod(c, parts, gate);
    const pm = lookupMod(p, parts, gate);
    rows.push({
      slotId: slot.path,
      slotLabel: slot.name || slot.nameId || slot.path,
      currentName: cm.name,
      proposedName: pm.name,
      currentErgo: cm.ergo,
      currentRecoil: cm.recoil,
      currentPrice: cm.price,
      proposedErgo: pm.ergo,
      proposedRecoil: pm.recoil,
      proposedPrice: pm.price,
      ergoDelta: pm.ergo - cm.ergo,
      recoilDelta: pm.recoil - cm.recoil,
      priceDelta: pm.price === null || cm.price === null ? null : pm.price - cm.price,
    });
  }
  return rows;
}
