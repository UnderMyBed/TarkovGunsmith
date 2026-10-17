import {
  buildPriceUnder,
  itemAvailability,
  weaponPaths,
  type BuildPrice,
  type BuildPriceInput,
  type ItemAvailability,
  type PriceGate,
} from "@tarkov/data";

type Obtainable = Extract<ItemAvailability, { available: true }>;

/**
 * The share card's availability pill: what it takes to make the purchase the card's price
 * stands for, in the words of the Builder's per-item pill (`availabilityLabel`).
 *
 * The pill describes the path `buildPriceUnder` chose (`price`, over the same `input`): the
 * weapon bought as the receiver or as the chosen preset (its own flea listing included), then
 * every part that path does not supply, walked as `totalFor` in `@tarkov/data`'s
 * `price-under.ts` walks it. A part the preset comes with is not a step, so the same purchase
 * reads the same under every profile that makes it.
 *
 * - `Locked` when `gate` is a profile and no path buys the build (`unobtainable`), the same
 *   rule as Compare's Locked pill.
 * - Otherwise `LL{n}` for the highest trader level any step needs, with ` barter` only when a
 *   barter step is at that level; then `Flea` when a step is the flea, and `quest` when a step
 *   assumes a quest is done; joined with ` · `. For one step this is exactly that item's
 *   Builder pill.
 * - In theorycraft (`gate === null`) a part nobody sells is shown as nothing, not as gated,
 *   as `shownAvailability` shows it in the Builder: the path is chosen as if the part were not
 *   on the build. A weapon nobody sells leaves only its parts.
 * - `null` when no step has a source to name; the card then leaves the pill off.
 */
export function availabilityPill(
  gate: PriceGate,
  input: BuildPriceInput,
  price: BuildPrice,
): string | null {
  let chosen = price;
  let parts = input.parts;
  if (chosen.status === "unobtainable") {
    if (gate !== null) return "Locked";
    // Theorycraft opens every gate, so what is missing is what nobody sells, which the
    // Builder shows as nothing. Choose the path for the rest.
    parts = parts.filter((part) => itemAvailability(part, null).available);
    chosen = buildPriceUnder(null, { ...input, parts });
  }

  const steps: Obtainable[] = [];
  const covers = new Map<string, number>();
  // Still unobtainable only when nobody sells the weapon itself (theorycraft): no weapon step.
  if (chosen.status !== "unobtainable") {
    const presetId = chosen.presetId;
    const path = weaponPaths(gate, input.weapon, input.presets).find(
      (p) => p.presetId === presetId,
    );
    // `buildPriceUnder` chose this path from the same list; not finding it is a bug, not a
    // build to draw without its weapon.
    if (path === undefined) {
      throw new Error(`og: no path ${String(presetId)} for weapon ${input.weapon.id}`);
    }
    steps.push(path.availability);
    for (const [id, n] of path.covers) covers.set(id, n);
  }
  for (const part of parts) {
    const supplied = covers.get(part.id) ?? 0;
    if (supplied > 0) {
      covers.set(part.id, supplied - 1);
      continue;
    }
    const availability = itemAvailability(part, gate);
    // The chosen path leaves no part unobtainable, and theorycraft dropped the unsold ones.
    if (!availability.available) throw new Error(`og: part ${part.id} has no open path`);
    steps.push(availability);
  }

  let level: number | null = null;
  for (const step of steps) {
    if (step.kind !== "flea") level = Math.max(level ?? step.minLevel, step.minLevel);
  }
  const barterAtLevel = steps.some((s) => s.kind === "barter" && s.minLevel === level);
  const tokens: string[] = [];
  if (level !== null) tokens.push(barterAtLevel ? `LL${level} barter` : `LL${level}`);
  if (steps.some((s) => s.kind === "flea")) tokens.push("Flea");
  if (steps.some((s) => s.kind !== "flea" && s.assumedQuest !== null)) tokens.push("quest");
  return tokens.length === 0 ? null : tokens.join(" · ");
}
