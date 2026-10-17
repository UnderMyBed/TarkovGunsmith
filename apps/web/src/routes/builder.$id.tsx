import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import {
  loadSavedBuild,
  useBuilderSnapshot,
  useLoadBuild,
  LoadBuildError,
  type BuilderSnapshot,
  type BuildV6,
} from "@tarkov/data";
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
import { useTrackOnce } from "../observability/track-hooks.js";
import { GameDataErrorCard } from "../features/builder/game-data-error.js";
import {
  clearDraft,
  hasDraft,
  readDraft,
  sharedDraftKey,
} from "../features/builder/build-draft.js";

const builderIdSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).optional(),
});

export const Route = createFileRoute("/builder/$id")({
  component: LoadedBuilderPage,
  validateSearch: (s) => builderIdSearchSchema.parse(s),
});

function LoadedBuilderPage() {
  const { id } = Route.useParams();
  // Keyed by id: nothing from one shared build's page carries over to another's.
  return <SharedBuildPage key={id} id={id} />;
}

function SharedBuildPage({ id }: { id: string }) {
  const { view } = Route.useSearch();
  const query = useLoadBuild(id);
  // A saved build is read against the game data before the editor takes it: any version is
  // brought to the current one, and an attachment not on the weapon moves to `orphaned`.
  const snapshot = useBuilderSnapshot();
  const build = useMemo(
    () => (query.data && snapshot.data ? loadSavedBuild(query.data, snapshot.data) : null),
    [query.data, snapshot.data],
  );
  const [generation, setGeneration] = useState(0);
  useTrackOnce(build !== null, "build_loaded", { source: "link" });

  if (query.isLoading || snapshot.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
        <Skeleton width="60%" height="2rem" />
        <Skeleton rows={6} height="2.5rem" />
      </div>
    );
  }

  // A failed background refetch keeps the data it had: the editor stays, and so do its edits.
  if (query.error && !query.data) {
    return <LoadErrorCard error={query.error} id={id} onRetry={() => void query.refetch()} />;
  }

  if (snapshot.error && !snapshot.data) {
    // The build itself loaded; it cannot be shown without the game data it is read against.
    return <GameDataErrorCard error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }

  if (!build || !snapshot.data) {
    return (
      <LoadErrorCard error={new Error("No data")} id={id} onRetry={() => void query.refetch()} />
    );
  }

  return (
    <SharedBuildEditor
      key={generation}
      id={id}
      shared={build}
      snapshot={snapshot.data}
      view={view}
      onRevert={() => setGeneration((g) => g + 1)}
    />
  );
}

/**
 * The editor over a shared build. Edits are kept under the build's own key so a reload or an
 * evicted tab returns to them, read through the same load as the shared build; the author's
 * embedded profile stays the shared build's, since a draft records the build alone. The stored
 * edits are read each time this mounts, so the editor never starts from an older copy.
 */
function SharedBuildEditor({
  id,
  shared,
  snapshot,
  view,
  onRevert,
}: {
  id: string;
  shared: BuildV6;
  snapshot: BuilderSnapshot;
  view: "editor" | "optimize" | undefined;
  onRevert: () => void;
}) {
  const draftKey = sharedDraftKey(id);
  const [initialBuild] = useState<BuildV6>(() => {
    const stored = readDraft(draftKey);
    if (stored === null) return shared;
    return {
      ...loadSavedBuild(stored, snapshot),
      ...(shared.profileSnapshot ? { profileSnapshot: shared.profileSnapshot } : {}),
    };
  });
  // Whether edits are actually stored: emptying the weapon removes them.
  const [edited, setEdited] = useState(() => hasDraft(draftKey));
  const [confirmingRevert, setConfirmingRevert] = useState(false);

  const revert = () => {
    clearDraft(draftKey);
    onRevert();
  };

  const notice = (
    <>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Loaded build <code>{id}</code>. Changes you make here won&apos;t update the saved copy —
            use &quot;Share build&quot; to create a new URL.
          </p>
        </CardContent>
      </Card>
      {edited && !confirmingRevert && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <span>Edited from the shared build</span>
          <span aria-hidden>·</span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmingRevert(true)}>
            Revert
          </Button>
        </div>
      )}
      {edited && confirmingRevert && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>Discard your edits and go back to the shared build?</span>
          <Button size="sm" variant="destructive" onClick={revert}>
            Discard
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingRevert(false)}>
            Keep my edits
          </Button>
        </div>
      )}
    </>
  );

  return (
    <BuilderPage
      initialBuild={initialBuild}
      notice={notice}
      view={view}
      draftKey={draftKey}
      onDraftWritten={() => {
        // Edited only while the edit is stored. Every edit here has a weapon, so it is stored
        // unless storage itself failed (full, or disabled; `writeDraft` warns). Then there are
        // no stored edits to revert, so the page claims none and closes a Revert prompt left
        // open, which would otherwise come back by itself once a later write succeeds.
        const stored = hasDraft(draftKey);
        setEdited(stored);
        if (!stored) setConfirmingRevert(false);
      }}
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
