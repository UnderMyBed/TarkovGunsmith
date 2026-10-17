import { useState } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Pill,
  Stamp,
  StatRow,
  WeaponSilhouette,
} from "@tarkov/ui";
import { ergonomicsFloorNote, shownErgonomics } from "./ergonomics.js";

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
  /** Labels of the required slots the build leaves empty: flags the build incomplete. */
  missingRequired?: readonly string[];
  /** One line per pair of fitted parts that clash ("ADAR stock × M4SS"): flags a conflict. */
  conflicts?: readonly string[];
  /** Truthy when the build has been saved and has a share URL. */
  sharedId?: string | null;
  /** When provided, renders a "Compare ↔" action in the header. */
  onCompare?: () => void;
  /** When provided, renders an "Optimize ⚙" action in the header. */
  onOptimize?: () => void;
  /** When provided, renders "New build", which asks before discarding this build. */
  onNewBuild?: () => void;
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
  missingRequired = [],
  conflicts = [],
  sharedId,
  onCompare,
  onOptimize,
  onNewBuild,
}: BuildHeaderProps) {
  const [confirmingNew, setConfirmingNew] = useState(false);
  // Floored on both sides: the delta is what the game's handling changes by.
  const ergonomicsDelta =
    currentSpec && stockSpec
      ? shownErgonomics(currentSpec.ergonomics) - shownErgonomics(stockSpec.ergonomics)
      : 0;
  return (
    <Card className="relative overflow-hidden">
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
            <div className="font-bold text-xl sm:text-2xl leading-none text-[var(--color-foreground)]">
              {weaponName ?? "No weapon selected"}
            </div>
            <div className="text-11 text-[var(--color-faint)]">
              {typeof modCount === "number"
                ? `${modCount} mod${modCount === 1 ? "" : "s"}`
                : "— mods"}
              {sharedId ? ` · build · ${sharedId.slice(0, 8)}` : ""}
            </div>
            {(missingRequired.length > 0 || conflicts.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {missingRequired.length > 0 && (
                  <Pill
                    tone="marginal"
                    title={`Required slots empty: ${missingRequired.join(", ")}`}
                  >
                    Incomplete · {missingRequired.length} required empty
                  </Pill>
                )}
                {conflicts.length > 0 && (
                  <Pill tone="accent" title={conflicts.join("; ")}>
                    Conflict · {conflicts.length}
                  </Pill>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onCompare && (
              <Button variant="secondary" size="sm" onClick={onCompare}>
                Compare ↔
              </Button>
            )}
            {onOptimize && (
              <Button variant="secondary" size="sm" onClick={onOptimize}>
                ◇ Optimize
              </Button>
            )}
            {onNewBuild && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmingNew(true)}>
                New build
              </Button>
            )}
            {sharedId && <Stamp tone="accent">Shared</Stamp>}
          </div>
        </CardHeader>
        {onNewBuild && confirmingNew && (
          <div role="alert" className="flex flex-wrap items-center gap-2 px-5 pt-3 text-sm">
            <span>Discard this build and start a new one?</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmingNew(false);
                onNewBuild();
              }}
            >
              Discard
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingNew(false)}>
              Keep this build
            </Button>
          </div>
        )}
        <CardContent className="flex flex-col gap-4">
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Build name (optional)"
            className="bg-transparent font-sans text-lg font-bold text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-faint)] focus:outline-none border-b border-transparent focus:border-[var(--color-primary)] pb-1 transition-colors"
          />
          <textarea
            value={description}
            maxLength={280}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="resize-none bg-transparent text-sm text-[var(--color-muted-foreground)] outline-none placeholder:text-[var(--color-faint)] focus:outline-none"
          />

          {currentSpec && stockSpec && (
            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
              <StatRow
                label="Ergonomics"
                title={ergonomicsFloorNote(currentSpec.ergonomics)}
                stock={shownErgonomics(stockSpec.ergonomics)}
                delta={formatDelta(ergonomicsDelta, false)}
                deltaDirection={deltaDirection(ergonomicsDelta, false)}
                value={oneDecimal(shownErgonomics(currentSpec.ergonomics))}
                percent={clampPercent(shownErgonomics(currentSpec.ergonomics))}
                barTone="primary"
              />
              <StatRow
                label="Recoil V"
                stock={stockSpec.verticalRecoil}
                delta={formatPercent(currentSpec.verticalRecoil, stockSpec.verticalRecoil)}
                deltaDirection={deltaDirection(
                  currentSpec.verticalRecoil - stockSpec.verticalRecoil,
                  true,
                )}
                value={oneDecimal(currentSpec.verticalRecoil)}
                percent={clampInverse(currentSpec.verticalRecoil, stockSpec.verticalRecoil)}
                barTone="primary"
              />
              <StatRow
                label="Recoil H"
                stock={stockSpec.horizontalRecoil}
                delta={formatPercent(currentSpec.horizontalRecoil, stockSpec.horizontalRecoil)}
                deltaDirection={deltaDirection(
                  currentSpec.horizontalRecoil - stockSpec.horizontalRecoil,
                  true,
                )}
                value={oneDecimal(currentSpec.horizontalRecoil)}
                percent={clampInverse(currentSpec.horizontalRecoil, stockSpec.horizontalRecoil)}
                barTone="primary"
              />
              <StatRow
                label="Weight"
                stock={stockSpec.weight.toFixed(2)}
                delta={formatDelta(currentSpec.weight - stockSpec.weight, true)}
                deltaDirection={deltaDirection(currentSpec.weight - stockSpec.weight, true)}
                value={currentSpec.weight.toFixed(2)}
                percent={clampPercent(currentSpec.weight * 20)}
                barTone={currentSpec.weight > stockSpec.weight ? "worse" : "primary"}
              />
              {/* The value alone: stock here is the bare receiver, whose MOA has no barrel in
                  it, so every real build would read as a regression against it. */}
              <StatRow label="MOA" value={currentSpec.accuracy.toFixed(2)} />
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

/** To one decimal, as the Spec panel shows it, dropping a trailing ".0" (119, not 119.0). */
function oneDecimal(value: number): string {
  return String(Number(value.toFixed(1)));
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
