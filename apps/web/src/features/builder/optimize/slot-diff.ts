import type { ModListItem, WeaponTree } from "@tarkov/data";

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
  readonly recoilDelta: number;
  readonly priceDelta: number;
}

interface ModStats {
  readonly name: string | null;
  readonly ergo: number;
  readonly recoil: number;
  readonly price: number;
}

function getFleaPrice(m: ModListItem): number {
  const flea = (m.buyFor ?? []).find((b) => b.vendor.__typename === "FleaMarket");
  return flea?.priceRUB ?? 0;
}

function lookupMod(id: string | undefined, modList: readonly ModListItem[]): ModStats {
  if (id === undefined) return { name: null, ergo: 0, recoil: 0, price: 0 };
  const m = modList.find((x) => x.id === id);
  if (m === undefined) return { name: id, ergo: 0, recoil: 0, price: 0 };
  return {
    name: m.name,
    ergo: m.properties.ergonomics,
    recoil: m.properties.recoilModifier,
    price: getFleaPrice(m),
  };
}

export function slotDiff(
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
  slotTree: WeaponTree,
  modList: readonly ModListItem[],
): readonly ChangedRow[] {
  const rows: ChangedRow[] = [];
  const walked = new Set<string>();

  for (const slot of slotTree.slots) {
    const c = current[slot.path];
    const p = proposed[slot.path];
    walked.add(slot.path);
    if (c === p) continue;
    const cm = lookupMod(c, modList);
    const pm = lookupMod(p, modList);
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
    const cm = lookupMod(c, modList);
    const pm = lookupMod(p, modList);
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
