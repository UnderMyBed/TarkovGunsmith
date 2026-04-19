import { createFileRoute } from "@tanstack/react-router";
import { useAmmoList } from "@tarkov/data";
import { Card, CardContent, CardHeader, CardTitle } from "@tarkov/ui";

export const Route = createFileRoute("/smoke")({
  component: SmokePage,
});

function SmokePage() {
  const ammo = useAmmoList();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Smoke</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          End-to-end proof that <code>@tarkov/data</code> → <code>api.tarkov.dev</code> → Zod parse
          → render works in the browser.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>useAmmoList()</CardTitle>
        </CardHeader>
        <CardContent>
          {ammo.isLoading && <p>Loading…</p>}
          {ammo.error && <ErrorDetails error={ammo.error} />}
          {ammo.data && (
            <div className="flex flex-col gap-2">
              <p>
                Loaded <strong>{ammo.data.length}</strong> ammo entries from{" "}
                <code>api.tarkov.dev</code>.
              </p>
              <ul className="grid gap-1 text-sm">
                {ammo.data.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <span>{a.name}</span>
                    <span className="text-[var(--color-muted-foreground)]">
                      pen {a.properties.penetrationPower} · dmg {a.properties.damage}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ZodLikeError {
  issues?: unknown;
}

function isZodLike(error: unknown): error is ZodLikeError & { issues: unknown[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as ZodLikeError).issues)
  );
}

function ErrorDetails({ error }: { error: Error }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold text-[var(--color-destructive)]">Error: {error.message}</p>
      {isZodLike(error) && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--color-muted-foreground)]">
            {error.issues.length} validation issue{error.issues.length === 1 ? "" : "s"} (click to
            expand)
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded border p-2">
            {JSON.stringify(error.issues, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
