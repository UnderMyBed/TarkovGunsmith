import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">TarkovGunsmith</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Ballistics calculator, weapon builder, and ammo-vs-armor matrix for Escape from Tarkov.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <Link to="/calc" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>Ballistic Calculator</CardTitle>
              <CardDescription>
                Live — pick ammo + armor + distance, see the result.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Enter ammo + armor + distance, get a deterministic shot result.
            </CardContent>
          </Card>
        </Link>
        <Link to="/matrix" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>AmmoVsArmor Matrix</CardTitle>
              <CardDescription>Live — color-coded shots-to-break grid.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Shots-to-break for every ammo against every armor, sorted and filtered.
            </CardContent>
          </Card>
        </Link>
        <Link to="/builder" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>Weapon Builder</CardTitle>
              <CardDescription>Live — pick weapon + mods, see live spec.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Compose mods, see live ergo / recoil / weight. Share-URL coming in v0.13.0.
            </CardContent>
          </Card>
        </Link>
        <Link to="/sim" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>Ballistics Simulator</CardTitle>
              <CardDescription>
                Multi-shot engagement — build a plan, simulate the kill.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Pick ammo + target armor, queue shots by zone, run the scenario.
            </CardContent>
          </Card>
        </Link>
        <Link to="/adc" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>Armor Damage Calculator</CardTitle>
              <CardDescription>
                Multi-shot burst at a single armor piece — shot-by-shot breakdown.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Pick ammo + armor, set shot count, see pen / damage / durability per shot.
            </CardContent>
          </Card>
        </Link>
        <Link to="/aec" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>Armor Effectiveness</CardTitle>
              <CardDescription>
                Pick an armor — see every ammo ranked by shots-to-break.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Inverse view: the armor is fixed; ammos are ranked reliable / marginal / ineffective.
            </CardContent>
          </Card>
        </Link>
        <Link to="/data" className="block">
          <Card className="transition-colors hover:border-[var(--color-primary)]">
            <CardHeader>
              <CardTitle>DataSheets</CardTitle>
              <CardDescription>Browse raw stats — ammo, armor, weapons, modules.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              Sortable, searchable reference tables.
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
}
