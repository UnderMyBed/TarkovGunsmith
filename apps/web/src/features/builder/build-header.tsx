import type { WeaponSpec } from "@tarkov/ballistics";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Stamp,
  StatRow,
  WeaponSilhouette,
} from "@tarkov/ui";

export interface BuildHeaderProps {
  name: string;
  description: string;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  /** Weapon short name, or null if no weapon selected. */
  weaponName?: string | null;
  /** Weapon item id for the silhouette backdrop. Null suppresses the backdrop. */
  weaponId?: string | null;
  /** Current build spec (weapon + current mods). */
  currentSpec: WeaponSpec | null;
  /** Stock-weapon spec (no mods). Used to compute deltas. */
  stockSpec: WeaponSpec | null;
  /** Mod count, for the meta line. */
  modCount?: number;
  /** Truthy when the build has been saved and has a share URL. */
  sharedId?: string | null;
  /** When provided, renders a "Compare ↔" action in the header. */
  onCompare?: () => void;
  /** When provided, renders an "Optimize ⚙" action in the header. */
  onOptimize?: () => void;
}

export function BuildHeader({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  weaponName,
  weaponId,
  currentSpec,
  stockSpec,
  modCount,
  sharedId,
  onCompare,
  onOptimize,
}: BuildHeaderProps) {
  return (
    <Card variant="bracket" className="relative overflow-hidden">
      {weaponId && (
        <div
          aria-hidden
          className="hidden md:block absolute inset-y-0 right-0 w-1/2 pointer-events-none"
        >
          <WeaponSilhouette
            itemId={weaponId}
            alt={weaponName ?? ""}
            className="h-full w-full object-contain object-right"
          />
        </div>
      )}
      <div className="relative z-10">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="font-display text-xl sm:text-2xl leading-none tracking-wide uppercase text-[var(--color-foreground)]">
              {weaponName ?? "NO WEAPON SELECTED"}
            </div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
              {typeof modCount === "number"
                ? `${modCount} MOD${modCount === 1 ? "" : "S"}`
                : "— MODS"}
              {sharedId ? ` · BUILD · ${sharedId.slice(0, 8)}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onCompare && (
              <Button variant="secondary" size="sm" onClick={onCompare}>
                Compare ↔
              </Button>
            )}
            {onOptimize && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onOptimize}
                className="font-mono tracking-[0.15em]"
              >
                ◇ OPTIMIZE
              </Button>
            )}
            {sharedId && <Stamp tone="amber">SHARED</Stamp>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Build name (optional)"
            className="bg-transparent font-sans text-lg font-bold tracking-tight text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-paper-dim)] focus:outline-none border-b border-transparent focus:border-[var(--color-primary)] pb-1 transition-colors"
          />
          <textarea
            value={description}
            maxLength={280}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="resize-none bg-transparent text-sm text-[var(--color-muted-foreground)] outline-none placeholder:text-[var(--color-paper-dim)] focus:outline-none"
          />

          {currentSpec && stockSpec && (
            <div className="flex flex-col gap-2 border-t border-dashed border-[var(--color-border)] pt-4">
              <StatRow
                label="ERGONOMICS"
                stock={stockSpec.ergonomics}
                delta={formatDelta(currentSpec.ergonomics - stockSpec.ergonomics, false)}
                deltaDirection={deltaDirection(
                  currentSpec.ergonomics - stockSpec.ergonomics,
                  false,
                )}
                value={currentSpec.ergonomics}
                percent={clampPercent(currentSpec.ergonomics)}
                barTone="primary"
              />
              <StatRow
                label="RECOIL V"
                stock={stockSpec.verticalRecoil}
                delta={formatPercent(currentSpec.verticalRecoil, stockSpec.verticalRecoil)}
                deltaDirection={deltaDirection(
                  currentSpec.verticalRecoil - stockSpec.verticalRecoil,
                  true,
                )}
                value={currentSpec.verticalRecoil}
                percent={clampInverse(currentSpec.verticalRecoil, stockSpec.verticalRecoil)}
                barTone="olive"
              />
              <StatRow
                label="RECOIL H"
                stock={stockSpec.horizontalRecoil}
                delta={formatPercent(currentSpec.horizontalRecoil, stockSpec.horizontalRecoil)}
                deltaDirection={deltaDirection(
                  currentSpec.horizontalRecoil - stockSpec.horizontalRecoil,
                  true,
                )}
                value={currentSpec.horizontalRecoil}
                percent={clampInverse(currentSpec.horizontalRecoil, stockSpec.horizontalRecoil)}
                barTone="olive"
              />
              <StatRow
                label="WEIGHT"
                stock={stockSpec.weight.toFixed(2)}
                delta={formatDelta(currentSpec.weight - stockSpec.weight, true)}
                deltaDirection={deltaDirection(currentSpec.weight - stockSpec.weight, true)}
                value={currentSpec.weight.toFixed(2)}
                percent={clampPercent(currentSpec.weight * 20)}
                barTone={currentSpec.weight > stockSpec.weight ? "destructive" : "primary"}
              />
              <StatRow
                label="ACCURACY"
                stock={stockSpec.accuracy.toFixed(1)}
                delta={formatDelta(currentSpec.accuracy - stockSpec.accuracy, true)}
                deltaDirection={deltaDirection(currentSpec.accuracy - stockSpec.accuracy, true)}
                value={currentSpec.accuracy.toFixed(1)}
                percent={100 - clampPercent(currentSpec.accuracy * 20)}
                barTone="primary"
              />
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

function formatDelta(delta: number, allowDecimals: boolean): string {
  if (Math.abs(delta) < 0.005) return "";
  const rounded = allowDecimals ? delta.toFixed(2) : String(Math.round(delta));
  return delta > 0 ? `+${rounded}` : rounded;
}

function formatPercent(current: number, stock: number): string {
  if (stock === 0) return "";
  const pct = ((current - stock) / stock) * 100;
  if (Math.abs(pct) < 0.5) return "";
  const sign = pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(0)}%`;
}

function deltaDirection(delta: number, higherIsWorse: boolean): "up" | "down" | "neutral" {
  if (Math.abs(delta) < 0.005) return "neutral";
  const improved = higherIsWorse ? delta < 0 : delta > 0;
  return improved ? "up" : "down";
}

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function clampInverse(current: number, stock: number): number {
  if (stock === 0) return 0;
  // current lower than stock → higher bar (good for "less recoil")
  const pct = 100 - (current / stock) * 100;
  return Math.max(0, Math.min(100, pct + 50));
}
