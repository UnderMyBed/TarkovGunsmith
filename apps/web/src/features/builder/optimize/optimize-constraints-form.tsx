import type { ReactElement } from "react";
import type { Objective } from "@tarkov/optimizer";
import type { WeaponTree } from "@tarkov/data";
import { Input, SectionTitle } from "@tarkov/ui";
import type { ConstraintsAction, ConstraintsState } from "./optimize-constraints-reducer.js";
import { OptimizePinTree } from "./optimize-pin-tree.js";

const OBJECTIVES: readonly { value: Objective; label: string }[] = [
  { value: "min-recoil", label: "Min recoil" },
  { value: "max-ergonomics", label: "Max ergonomics" },
  { value: "min-weight", label: "Min weight" },
  { value: "max-accuracy", label: "Max accuracy" },
];

interface Props {
  state: ConstraintsState;
  dispatch: (action: ConstraintsAction) => void;
  slotTree: WeaponTree;
  /** The current build, which the pin tree follows. */
  attachments: Readonly<Record<string, string>>;
  /** A part's display name. */
  nameOf: (id: string) => string;
  /** A budget is checked against live prices, so the field waits for them. */
  pricesReady: boolean;
}

export function OptimizeConstraintsForm({
  state,
  dispatch,
  slotTree,
  attachments,
  nameOf,
  pricesReady,
}: Props): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionTitle index={1} title="Objective" />
        <div className="grid grid-cols-2 gap-2">
          {OBJECTIVES.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 border border-[var(--color-border)] p-2 font-mono text-sm uppercase tracking-wider hover:border-[var(--color-primary)]"
            >
              <input
                type="radio"
                name="objective"
                value={o.value}
                checked={state.objective === o.value}
                onChange={() => dispatch({ type: "SET_OBJECTIVE", objective: o.value })}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle index={2} title="Budget (₽, optional)" />
        <Input
          type="number"
          min={0}
          aria-label="Budget"
          disabled={!pricesReady}
          placeholder={pricesReady ? "No cap" : "Budget needs prices"}
          value={state.budgetRub !== undefined ? String(state.budgetRub) : ""}
          onChange={(e) => dispatch({ type: "SET_BUDGET", value: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle index={3} title="Pinned slots" />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Free slots are the solver&apos;s to choose. Lock keeps the part you have; Empty leaves the
          slot bare.
        </p>
        <OptimizePinTree
          slotTree={slotTree}
          attachments={attachments}
          pinnedSlots={state.pinnedSlots}
          nameOf={nameOf}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}
