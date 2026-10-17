import type { WeaponSpec } from "@tarkov/ballistics";
import type { MountedMagazine } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { ergonomicsFloorNote, shownErgonomics } from "./ergonomics.js";

export interface SpecPanelProps {
  weaponShortName: string;
  spec: WeaponSpec;
  /** The magazine in the weapon's own magazine slot, or `null` with none fitted. */
  magazine: MountedMagazine | null;
}

/** The "Spec" card: computed weapon stats for the current build, each in its unit. */
export function SpecPanel({ weaponShortName, spec, magazine }: SpecPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spec</CardTitle>
        <CardDescription>
          <code>{weaponShortName}</code> with {spec.modCount} mod{spec.modCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-2 sm:grid-cols-3">
          <SpecStat
            label="Ergonomics"
            value={shownErgonomics(spec.ergonomics).toFixed(1)}
            title={ergonomicsFloorNote(spec.ergonomics)}
          />
          <SpecStat label="Vert. recoil" value={spec.verticalRecoil.toFixed(1)} />
          <SpecStat label="Horiz. recoil" value={spec.horizontalRecoil.toFixed(1)} />
          <SpecStat label="Weight" value={`${spec.weight.toFixed(2)} kg`} />
          <SpecStat
            label="Accuracy"
            value={`${spec.accuracy.toFixed(2)} MOA`}
            detail={`base ${spec.baseMoa.toFixed(2)} · accuracy ${signedPercent(spec.accuracyModifier * 100)}`}
          />
          <SpecStat
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
          <SpecStat label="Effective distance" value={`${spec.effectiveDistance} m`} />
          <SpecStat label="Sighting range" value={`${spec.sightingRange} m`} />
          <SpecStat label="Fire rate" value={`${spec.fireRate} rpm`} />
          <SpecStat label="Mods attached" value={`${spec.modCount}`} />
        </dl>
        <section aria-label="Magazine" className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Magazine
          </h3>
          {magazine === null ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">None fitted.</p>
          ) : (
            <dl className="grid gap-2 sm:grid-cols-3">
              <SpecStat label="Capacity" value={`${magazine.capacity} rds`} />
              <SpecStat
                label="Load/unload modifier"
                value={signedPercent(magazine.loadModifier * 100)}
              />
              <SpecStat
                label="Malfunction chance"
                value={`${unsignedPercent(magazine.malfunctionChance * 100)}%`}
              />
            </dl>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function SpecStat({
  label,
  value,
  detail,
  title,
}: {
  label: string;
  value: string;
  detail?: string;
  /** What the value leaves out, shown on hover. */
  title?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="text-lg font-semibold" title={title}>
        {value}
      </dd>
      {detail !== undefined && (
        <dd className="text-xs text-[var(--color-muted-foreground)]">{detail}</dd>
      )}
    </div>
  );
}

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
