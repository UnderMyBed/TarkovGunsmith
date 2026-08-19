import type { ReactElement } from "react";

/**
 * Accuracy disclosure for the shots-to-break numbers.
 *
 * Armor is modelled as one monolithic layer, using upstream's top-level
 * `class` / `durability` / `material`. Those fields are a rollup: 39 of the 47
 * live vests put a plate in the chest path, and for those the top-level
 * durability is a median 4.5x the durability of the plate that actually stops
 * the round — often at a completely different armor class and material.
 *
 * The measured effect is a 4-17x overstatement of shots-to-break. ADR-0003
 * accepts modelling plates properly; until that lands, saying so here is the
 * minimum honest thing to do, because the bias is large, systematic, and in the
 * direction that flatters armor.
 *
 * Delete this component when ADR-0003 is implemented, not before.
 */
export function SingleLayerCaveat(): ReactElement {
  return (
    <div className="mb-6 flex items-baseline gap-3 border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-rust)] bg-[var(--color-card)] px-4 py-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-rust)]">
        ▲ Single-layer model
      </span>
      <span className="text-sm text-[var(--color-muted-foreground)]">
        Armor is modelled as one layer, so plate-equipped vests read as{" "}
        <strong className="text-[var(--color-foreground)]">far more durable than they are</strong> —
        measured at 4–17× on live data. Ordering between ammo is more reliable than the absolute
        counts. Plate modelling is tracked in ADR-0003.
      </span>
    </div>
  );
}
