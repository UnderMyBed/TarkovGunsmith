import {
  adaptMod,
  priceUnder,
  resolveBuild,
  visibleSlots,
  type AttachablePart,
  type BuildPrice,
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
  /**
   * What this slot's part adds to the build's cost: its price under the gate, `0` for an empty
   * slot or a part the build's preset comes with, `null` when not known.
   */
  readonly currentPrice: number | null;
  readonly proposedErgo: number;
  readonly proposedRecoil: number;
  readonly proposedPrice: number | null;
  readonly ergoDelta: number;
  /**
   * Difference of two `recoilModifier` values, so it carries upstream's
   * fractional unit: -0.22 means 22 percentage points less recoil. Renderers
   * scale by 100 — see proposal-tree.tsx.
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

/** A row side's figures; `m` is the part on the weapon there, or `undefined` for an empty slot. */
function lookupMod(m: AttachablePart | undefined, gate: PriceGate, covered: boolean): ModStats {
  if (m === undefined) return { name: null, ergo: 0, recoil: 0, price: 0 };
  const stats = adaptMod(m);
  return {
    name: m.name,
    ergo: stats.ergonomicsDelta,
    recoil: stats.recoilModifier,
    price: covered ? 0 : priceUnder(gate, m),
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

/** Item id → how many of it the way each build buys its weapon comes with. */
export interface BuildCovers {
  readonly current: ReadonlyMap<string, number>;
  readonly proposed: ReadonlyMap<string, number>;
}

const NO_COVERS: BuildCovers = { current: new Map(), proposed: new Map() };

/**
 * The slot paths whose part the build's preset supplies, so the build pays nothing for them.
 * Unchanged slots take a preset's parts first: both builds then agree on every unchanged slot,
 * and the rows alone carry the difference.
 */
function coveredPaths(
  on: Readonly<Record<string, string>>,
  order: readonly string[],
  covers: ReadonlyMap<string, number>,
): Set<string> {
  const left = new Map(covers);
  const covered = new Set<string>();
  for (const path of order) {
    const id = on[path];
    if (id === undefined) continue;
    const n = left.get(id) ?? 0;
    if (n === 0) continue;
    left.set(id, n - 1);
    covered.add(path);
  }
  return covered;
}

/**
 * One row per slot whose part differs between the two builds, in slot order. Only parts on the
 * weapon are compared (`resolveBuild`): a stale key beneath a removed or replaced
 * part is not a change anyone could accept.
 *
 * A row's price is what its part adds to that build's cost, as `buildPriceUnder` counts it: a
 * part the build's preset comes with (`covers`) adds nothing. When both builds buy the weapon
 * the same way, the rows' price deltas sum to the change in the build's cost.
 */
export function slotDiff(
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
  slotTree: WeaponTree,
  parts: ReadonlyMap<string, AttachablePart>,
  gate: PriceGate,
  covers: BuildCovers = NO_COVERS,
): readonly ChangedRow[] {
  const currentBuild = resolveBuild(slotTree, current, parts);
  const proposedBuild = resolveBuild(slotTree, proposed, parts);
  const currentOn = currentBuild.attachments;
  const proposedOn = proposedBuild.attachments;
  const partAt = (build: typeof currentBuild, path: string) =>
    build.placed.find((p) => p.path === path)?.part;
  // Every slot either build shows, so a change deep under a barrel or handguard gets its real
  // slot name.
  const slots = shownSlots(slotTree, currentOn, proposedOn);
  const unchanged = slots.filter((s) => currentOn[s.path] === proposedOn[s.path]);
  const changed = slots.filter((s) => currentOn[s.path] !== proposedOn[s.path]);
  const order = [...unchanged, ...changed].map((s) => s.path);
  const currentCovered = coveredPaths(currentOn, order, covers.current);
  const proposedCovered = coveredPaths(proposedOn, order, covers.proposed);
  const rows: ChangedRow[] = [];
  for (const slot of changed) {
    const cm = lookupMod(partAt(currentBuild, slot.path), gate, currentCovered.has(slot.path));
    const pm = lookupMod(partAt(proposedBuild, slot.path), gate, proposedCovered.has(slot.path));
    rows.push({
      slotId: slot.path,
      slotLabel: slot.label || slot.nameId || slot.path,
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

/** The weapon bought another way by the suggested build, and what that alone changes in cost. */
export interface WeaponChange {
  /** What the current build buys the weapon as: a preset's name, or the receiver's. */
  readonly from: string;
  readonly to: string;
  /** `null` when a price on either build is not known. */
  readonly priceDelta: number | null;
}

/**
 * When the two builds buy the weapon by different paths, the weapon's own change in cost
 * belongs to no slot: it is the build's cost change less what the rows account for, so the
 * rows and this line together sum to it. `null` when both buy it the same way, or either
 * build's price is not worked out. `nameOf` names a preset id, or the receiver for `null`.
 */
export function weaponChangeOf(
  current: BuildPrice | null,
  proposed: BuildPrice | null,
  rows: readonly ChangedRow[],
  nameOf: (presetId: string | null) => string,
): WeaponChange | null {
  if (current === null || proposed === null) return null;
  if (current.status === "unobtainable" || proposed.status === "unobtainable") return null;
  if (current.presetId === proposed.presetId) return null;
  let rowsDelta: number | null = 0;
  for (const row of rows) {
    rowsDelta = rowsDelta === null || row.priceDelta === null ? null : rowsDelta + row.priceDelta;
  }
  const known = current.status === "priced" && proposed.status === "priced" && rowsDelta !== null;
  return {
    from: nameOf(current.presetId),
    to: nameOf(proposed.presetId),
    priceDelta: known ? proposed.totalRUB - current.totalRUB - rowsDelta! : null,
  };
}
