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
        <Card>
          <CardHeader>
            <CardTitle>AmmoVsArmor Matrix</CardTitle>
            <CardDescription>Coming in Milestone 1.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-muted-foreground)]">
            Shots-to-break for every ammo against every armor, sorted and filtered.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weapon Builder</CardTitle>
            <CardDescription>Coming in Milestone 1.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-muted-foreground)]">
            Compose mods, see live ergo / recoil / weight, share via short URL.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
