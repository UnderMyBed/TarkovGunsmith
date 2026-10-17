import { useId, useState } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import type { MountedMagazine } from "@tarkov/data";
import { Button, Input, cn, focusRing } from "@tarkov/ui";
import type { PricesStatus } from "./build-price.js";
import { PricesLine } from "./prices-line.js";

export interface DetailsPanelProps {
  name: string;
  description: string;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  /** The build's spec, once a weapon is picked and its parts are in. */
  spec: WeaponSpec | null;
  /** The magazine in the weapon's own magazine slot, or `null` with none fitted. */
  magazine: MountedMagazine | null;
  /** Offered in progression with a weapon picked: a theorycraft build was not made under it. */
  embedProfile?:
    { readonly checked: boolean; readonly onChange: (embed: boolean) => void } | undefined;
  /** When provided, offers "New build", which asks before discarding this build. */
  onNewBuild?: (() => void) | undefined;
  /** When the Builder's data was taken from upstream (ISO 8601), once it has loaded. */
  dataAsOf: string | null;
  /** Where live prices stand. */
  prices: PricesStatus;
}

const DATA_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const LABEL = "text-12 text-[var(--color-muted-foreground)]";
const META = "text-11 text-[var(--color-muted-foreground)]";

/** A magnitude to at most one decimal, with no trailing ".0". */
function unsignedPercent(percent: number): string {
  return String(Number(Math.abs(percent).toFixed(1)));
}

/** A signed percent as upstream reports it: "+16%", "−10.3%", "0%". */
export function signedPercent(percent: number): string {
  const rounded = Number(percent.toFixed(1));
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "−"}${unsignedPercent(rounded)}%`;
}

/**
 * The workbench's Details panel: the build's name and notes, the stats the stat strip leaves
 * out (velocity, ranges, fire rate, magazine), "New build", and where the data and prices stand.
 */
export function DetailsPanel({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  spec,
  magazine,
  embedProfile,
  onNewBuild,
  dataAsOf,
  prices,
}: DetailsPanelProps) {
  const [confirmingNew, setConfirmingNew] = useState(false);
  const nameId = useId();
  const notesId = useId();
  return (
    <section
      aria-label="Details"
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Details</h2>
        {onNewBuild && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingNew(true)}>
            New build
          </Button>
        )}
      </div>
      {onNewBuild && confirmingNew && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className={LABEL}>
            Build name
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={60}
            placeholder="Optional"
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={notesId} className={LABEL}>
            Notes
          </label>
          <textarea
            id={notesId}
            value={description}
            maxLength={280}
            rows={2}
            placeholder="Optional"
            onChange={(e) => onDescriptionChange(e.target.value)}
            className={cn(
              "resize-y rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-faint)]",
              focusRing,
            )}
          />
        </div>
        {embedProfile && (
          <label className="flex items-center gap-2 text-12 text-[var(--color-muted-foreground)]">
            <input
              type="checkbox"
              checked={embedProfile.checked}
              onChange={(e) => embedProfile.onChange(e.target.checked)}
            />
            <span>Embed my progression snapshot in the shared URL</span>
          </label>
        )}
      </div>

      {spec && (
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 border-t border-[var(--color-border)] pt-4">
          <Stat
            label="Muzzle velocity"
            value={
              spec.muzzleVelocity === null
                ? signedPercent(spec.velocityModifier)
                : `${Math.round(spec.muzzleVelocity)} m/s`
            }
            detail={
              spec.muzzleVelocityAmmo === null
                ? "velocity modifier, no default ammo"
                : `${spec.muzzleVelocityAmmo} · ${signedPercent(spec.velocityModifier)}`
            }
          />
          <Stat label="Effective distance" value={`${spec.effectiveDistance} m`} />
          <Stat label="Sighting range" value={`${spec.sightingRange} m`} />
          <Stat label="Fire rate" value={`${spec.fireRate} rpm`} />
          <Stat label="Mods attached" value={`${spec.modCount}`} />
          {magazine === null ? (
            <Stat label="Magazine" value="None fitted" />
          ) : (
            <>
              <Stat label="Capacity" value={`${magazine.capacity} rds`} />
              <Stat
                label="Load/unload modifier"
                value={signedPercent(magazine.loadModifier * 100)}
              />
              <Stat
                label="Malfunction chance"
                value={`${unsignedPercent(magazine.malfunctionChance * 100)}%`}
              />
            </>
          )}
        </dl>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-3">
        {dataAsOf !== null && (
          <p className={META}>
            Data as of <time dateTime={dataAsOf}>{DATA_DATE.format(new Date(dataAsOf))}</time>
          </p>
        )}
        <PricesLine prices={prices} />
      </div>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-11 text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
      {detail !== undefined && <dd className="text-11 text-[var(--color-faint)]">{detail}</dd>}
    </div>
  );
}
