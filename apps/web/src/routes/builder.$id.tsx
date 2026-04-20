import { createFileRoute, Link } from "@tanstack/react-router";
import { useLoadBuild, LoadBuildError } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { BuilderPage } from "./builder.js";

export const Route = createFileRoute("/builder/$id")({
  component: LoadedBuilderPage,
});

function LoadedBuilderPage() {
  const { id } = Route.useParams();
  const query = useLoadBuild(id);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="pt-6">Loading build…</CardContent>
        </Card>
      </div>
    );
  }

  if (query.error) {
    return <LoadErrorCard error={query.error} id={id} />;
  }

  if (!query.data) {
    return <LoadErrorCard error={new Error("No data")} id={id} />;
  }

  const build = query.data;
  return (
    <BuilderPage
      initialWeaponId={build.weaponId}
      initialModIds={build.modIds}
      notice={
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Loaded build <code>{id}</code>. Changes you make here won't update the saved copy —
              use "Share build" to create a new URL.
            </p>
          </CardContent>
        </Card>
      }
    />
  );
}

function LoadErrorCard({ error, id }: { error: Error; id: string }) {
  const code = error instanceof LoadBuildError ? error.code : "unreachable";

  const { title, body } = (() => {
    switch (code) {
      case "invalid-id":
        return {
          title: "Invalid build id",
          body: `The id "${id}" doesn't match the build-id format.`,
        };
      case "not-found":
        return {
          title: "Build not found",
          body: "This build has expired (30-day lifetime) or never existed.",
        };
      case "invalid-schema":
        return {
          title: "Build couldn't be loaded",
          body: "This build was stored in a format we can't read. It may have been created by a newer version of the app.",
        };
      case "unreachable":
      default:
        return {
          title: "Couldn't reach build storage",
          body: "Check your connection and try again.",
        };
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/builder" className="text-sm underline underline-offset-4 hover:opacity-80">
            Start a fresh build →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
