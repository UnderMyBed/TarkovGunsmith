import { useState } from "react";
import { useTrackOnce } from "../../observability/track-hooks.js";
import { loadSavedBuild, useBuilderSnapshot, type BuilderSnapshot } from "@tarkov/data";
import { Skeleton } from "@tarkov/ui";
import { BuilderPage } from "./builder-page.js";
import { GameDataErrorCard } from "./game-data-error.js";
import { clearDraft, DRAFT_KEY, hasDraft, readDraft } from "./build-draft.js";

/**
 * `/builder` with no build id: the in-progress build, kept in `DRAFT_KEY` so a reload, back
 * navigation or an evicted tab returns to it. A stored draft is read against the game data by
 * `loadSavedBuild`, the same load a shared build takes, so a draft written against older data
 * keeps every part it no longer places, as orphans. "New build" discards it.
 */
export function DraftBuilderPage({ view }: { view?: "editor" | "optimize" }) {
  const [generation, setGeneration] = useState(0);
  const snapshot = useBuilderSnapshot();
  const stored = hasDraft(DRAFT_KEY);

  // A stored draft waits for the game data it is read against. If that fails, the draft stays
  // as stored and the page says so: an editor mounted here would refetch the game data on
  // mount and fall back to this state, in a loop.
  if (stored && !snapshot.data) {
    if (snapshot.error) {
      return <GameDataErrorCard error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
    }
    return (
      <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
        <Skeleton width="60%" height="2rem" />
        <Skeleton rows={6} height="2.5rem" />
      </div>
    );
  }

  const newBuild = () => {
    clearDraft(DRAFT_KEY);
    setGeneration((g) => g + 1);
  };

  return (
    <DraftEditor key={generation} snapshot={snapshot.data} view={view} onNewBuild={newBuild} />
  );
}

/**
 * The editor over the stored draft, read each time it mounts, so no remount starts from an
 * older copy than the one stored.
 */
function DraftEditor({
  snapshot,
  view,
  onNewBuild,
}: {
  snapshot: BuilderSnapshot | undefined;
  view: "editor" | "optimize" | undefined;
  onNewBuild: () => void;
}) {
  const [initialBuild] = useState(() => {
    const draft = readDraft(DRAFT_KEY);
    return draft && snapshot ? loadSavedBuild(draft, snapshot) : undefined;
  });
  useTrackOnce(initialBuild !== undefined, "build_loaded", { source: "draft" });
  return (
    <BuilderPage
      initialBuild={initialBuild}
      view={view}
      draftKey={DRAFT_KEY}
      onNewBuild={onNewBuild}
    />
  );
}
