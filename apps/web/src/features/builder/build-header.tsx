import type { WeaponSpec } from "@tarkov/ballistics";
import { Card, CardContent } from "@tarkov/ui";

export interface BuildHeaderProps {
  name: string;
  description: string;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  /** Current build spec (weapon + current mods). */
  currentSpec: WeaponSpec | null;
  /** Stock-weapon spec (no mods). Used to compute deltas. */
  stockSpec: WeaponSpec | null;
}

export function BuildHeader({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  currentSpec,
  stockSpec,
}: BuildHeaderProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Build name (optional)"
          className="bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
        />
        <textarea
          value={description}
          maxLength={280}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="resize-none bg-transparent text-sm text-[var(--color-muted-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
        />
        {currentSpec && stockSpec && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Delta label="Ergo" current={currentSpec.ergonomics} stock={stockSpec.ergonomics} />
            <Delta
              label="Vert. recoil"
              current={currentSpec.verticalRecoil}
              stock={stockSpec.verticalRecoil}
              higherIsWorse
            />
            <Delta
              label="Horiz. recoil"
              current={currentSpec.horizontalRecoil}
              stock={stockSpec.horizontalRecoil}
              higherIsWorse
            />
            <Delta label="Accuracy" current={currentSpec.accuracy} stock={stockSpec.accuracy} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Delta({
  label,
  current,
  stock,
  higherIsWorse,
}: {
  label: string;
  current: number;
  stock: number;
  higherIsWorse?: boolean;
}) {
  const delta = current - stock;
  const sign = delta > 0 ? "+" : "";
  const improved = higherIsWorse ? delta < 0 : delta > 0;
  const cls =
    delta === 0 ? "" : improved ? "text-[var(--color-primary)]" : "text-[var(--color-destructive)]";
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-2">
      <dt className="text-[0.65rem] uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="font-semibold">{current.toFixed(1)}</span>
        {delta !== 0 && (
          <span className={`text-xs ${cls}`}>
            {sign}
            {delta.toFixed(1)}
          </span>
        )}
      </dd>
    </div>
  );
}
