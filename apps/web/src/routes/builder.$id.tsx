import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import { loadSavedBuild, useBuilderSnapshot, useLoadBuild, LoadBuildError } from "@tarkov/data";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@tarkov/ui";
import { BuilderPage } from "../features/builder/builder-page.js";
import { clearDraft, readDraft, sharedDraftKey } from "../features/builder/build-draft.js";

const builderIdSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).optional(),
});

export const Route = createFileRoute("/builder/$id")({
  component: LoadedBuilderPage,
  validateSearch: (s) => builderIdSearchSchema.parse(s),
});

function LoadedBuilderPage() {
  const { id } = Route.useParams();
  const { view } = Route.useSearch();
  const query = useLoadBuild(id);
  // A saved build is read against the game data before the editor takes it: any version is
  // brought to the current one, and an attachment not on the weapon moves to `orphaned`.
  const snapshot = useBuilderSnapshot();
  const build = useMemo(
    () => (query.data && snapshot.data ? loadSavedBuild(query.data, snapshot.data) : null),
    [query.data, snapshot.data],
  );
  // Edits to this shared build, kept under its own key so a reload or an evicted tab returns
  // to them. Read through the same load as the shared build. The author's embedded profile
  // stays the shared build's: a draft records the build alone.
  const draftKey = sharedDraftKey(id);
  const [stored, setStored] = useState(() => readDraft(draftKey));
  const [edited, setEdited] = useState(stored !== null);
  const [generation, setGeneration] = useState(0);
  const draft = useMemo(
    () =>
      stored && snapshot.data && build
        ? {
            ...loadSavedBuild(stored, snapshot.data),
            ...(build.profileSnapshot ? { profileSnapshot: build.profileSnapshot } : {}),
          }
        : null,
    [stored, snapshot.data, build],
  );

  if (query.isLoading || snapshot.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
        <Skeleton width="60%" height="2rem" />
        <Skeleton rows={6} height="2.5rem" />
      </div>
    );
  }

  if (query.error) {
    return <LoadErrorCard error={query.error} id={id} onRetry={() => void query.refetch()} />;
  }

  if (snapshot.error) {
    // The build itself loaded; it cannot be shown without the game data it is read against.
    return (
      <Card>
        <CardHeader>
          <CardTitle>Game data couldn&apos;t be loaded</CardTitle>
          <CardDescription>{snapshot.error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void snapshot.refetch()} size="sm">
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!build) {
    return (
      <LoadErrorCard error={new Error("No data")} id={id} onRetry={() => void query.refetch()} />
    );
  }

  const notice = (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Loaded build <code>{id}</code>. Changes you make here won&apos;t update the saved copy —
          use &quot;Share build&quot; to create a new URL.
        </p>
      </CardContent>
    </Card>
  );

  const revert = () => {
    clearDraft(draftKey);
    setStored(null);
    setEdited(false);
    setGeneration((g) => g + 1);
  };

  return (
    <BuilderPage
      key={generation}
      initialBuild={draft ?? build}
      notice={
        <>
          {notice}
          {edited && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <span>Edited from the shared build</span>
              <span aria-hidden>·</span>
              <Button variant="ghost" size="sm" onClick={revert}>
                Revert
              </Button>
            </div>
          )}
        </>
      }
      view={view}
      draftKey={draftKey}
      onDraftWritten={() => setEdited(true)}
    />
  );
}

function LoadErrorCard({ error, id, onRetry }: { error: Error; id: string; onRetry: () => void }) {
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
          body: "This build doesn't exist. Builds saved under the old 30-day policy may have expired; new ones never do.",
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
        <CardContent className="flex flex-col items-start gap-3">
          {code === "unreachable" && (
            <Button onClick={onRetry} size="sm">
              Try again
            </Button>
          )}
          <Link to="/builder" className="text-sm underline underline-offset-4 hover:opacity-80">
            Open the builder →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
