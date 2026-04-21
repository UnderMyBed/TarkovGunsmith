import type { ReactElement } from "react";
import type { Objective } from "@tarkov/optimizer";
import type { WeaponTree } from "@tarkov/data";
import { Button, Input, SectionTitle } from "@tarkov/ui";
import type { ConstraintsAction, ConstraintsState } from "./optimize-constraints-reducer.js";

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
  onRun: () => void;
}

export function OptimizeConstraintsForm({ state, dispatch, slotTree, onRun }: Props): ReactElement {
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
          placeholder="No cap"
          value={state.budgetRub !== undefined ? String(state.budgetRub) : ""}
          onChange={(e) => dispatch({ type: "SET_BUDGET", value: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle index={3} title="Pinned slots" />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Un-check a slot to let the solver pick a different item for it.
        </p>
        <ul className="flex flex-col gap-1 border border-dashed border-[var(--color-border)] p-2">
          {slotTree.slots.map((slot) => (
            <li key={slot.path} className="flex items-center justify-between font-mono text-sm">
              <label className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={state.pinnedSlots.has(slot.path)}
                  onChange={() => dispatch({ type: "TOGGLE_PIN", slotPath: slot.path })}
                />
                <span className="uppercase tracking-wider">{slot.name || slot.nameId}</span>
              </label>
              <span className="text-[var(--color-muted-foreground)]">
                {state.pinnedSlots.has(slot.path)
                  ? (state.pinnedSlots.get(slot.path) ?? "(empty)")
                  : "solver"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button onClick={onRun}>Run optimization</Button>
      </div>
    </div>
  );
}
