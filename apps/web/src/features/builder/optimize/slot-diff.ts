import {
  adaptMod,
  fleaPriceRub,
  visibleSlots,
  type AttachablePart,
  type WeaponTree,
} from "@tarkov/data";

export interface ChangedRow {
  readonly slotId: string;
  readonly slotLabel: string;
  readonly currentName: string | null;
  readonly proposedName: string | null;
  readonly currentErgo: number;
  readonly currentRecoil: number;
  readonly currentPrice: number;
  readonly proposedErgo: number;
  readonly proposedRecoil: number;
  readonly proposedPrice: number;
  readonly ergoDelta: number;
  /**
   * Difference of two `recoilModifier` values, so it carries upstream's
   * fractional unit: -0.22 means 22 percentage points less recoil. Renderers
   * scale by 100 — see mod-changes-table.tsx.
   */
  readonly recoilDelta: number;
  readonly priceDelta: number;
}

interface ModStats {
  readonly name: string | null;
  readonly ergo: number;
  readonly recoil: number;
  readonly price: number;
}

function lookupMod(id: string | undefined, parts: ReadonlyMap<string, AttachablePart>): ModStats {
  if (id === undefined) return { name: null, ergo: 0, recoil: 0, price: 0 };
  const m = parts.get(id);
  if (m === undefined) return { name: id, ergo: 0, recoil: 0, price: 0 };
  const stats = adaptMod(m);
  return {
    name: m.name,
    ergo: stats.ergonomicsDelta,
    recoil: stats.recoilModifier,
    price: fleaPriceRub(m),
  };
}

export function slotDiff(
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
  slotTree: WeaponTree,
  parts: ReadonlyMap<string, AttachablePart>,
): readonly ChangedRow[] {
  const rows: ChangedRow[] = [];
  const walked = new Set<string>();

  // Every slot either build shows, so a change deep under a barrel or handguard gets its real
  // slot name rather than the path fallback below.
  const seen = new Set<string>();
  const shown = [...visibleSlots(slotTree, current), ...visibleSlots(slotTree, proposed)].filter(
    (slot) => !seen.has(slot.path) && seen.add(slot.path),
  );
  for (const slot of shown) {
    const c = current[slot.path];
    const p = proposed[slot.path];
    walked.add(slot.path);
    if (c === p) continue;
    const cm = lookupMod(c, parts);
    const pm = lookupMod(p, parts);
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
      priceDelta: pm.price - cm.price,
    });
  }

  // Catch slot paths that exist in either map but not in the slot tree's flat walk.
  for (const key of new Set([...Object.keys(current), ...Object.keys(proposed)])) {
    if (walked.has(key)) continue;
    const c = current[key];
    const p = proposed[key];
    if (c === p) continue;
    const cm = lookupMod(c, parts);
    const pm = lookupMod(p, parts);
    rows.push({
      slotId: key,
      slotLabel: key.toUpperCase(),
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
      priceDelta: pm.price - cm.price,
    });
  }

  return rows;
}
