import type { WeaponSpec } from "@tarkov/ballistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";

export interface SpecPanelProps {
  weaponShortName: string;
  spec: WeaponSpec;
}

/** The "Spec" card: computed weapon stats for the current build. */
export function SpecPanel({ weaponShortName, spec }: SpecPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spec</CardTitle>
        <CardDescription>
          <code>{weaponShortName}</code> with {spec.modCount} mod{spec.modCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 sm:grid-cols-3">
          <SpecStat label="Ergonomics" value={spec.ergonomics.toFixed(1)} />
          <SpecStat label="Vert. recoil" value={spec.verticalRecoil.toFixed(1)} />
          <SpecStat label="Horiz. recoil" value={spec.horizontalRecoil.toFixed(1)} />
          <SpecStat label="Weight" value={`${spec.weight.toFixed(2)} kg`} />
          <SpecStat label="Accuracy" value={spec.accuracy.toFixed(2)} />
          <SpecStat label="Mods attached" value={`${spec.modCount}`} />
        </dl>
      </CardContent>
    </Card>
  );
}

function SpecStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
