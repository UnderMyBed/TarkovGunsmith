import { useState } from "react";
import { loadSavedBuild, useBuilderSnapshot, type BuilderSnapshot } from "@tarkov/data";
import { Skeleton } from "@tarkov/ui";
import { BuilderPage } from "./builder-page.js";
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

  if (stored && snapshot.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
        <Skeleton width="60%" height="2rem" />
        <Skeleton rows={6} height="2.5rem" />
      </div>
    );
  }

  // A draft that cannot be read against the game data is kept, not overwritten: without the
  // snapshot the page shows the data error and nothing is persisted. Once the game data
  // arrives, the editor mounts and reads the draft.
  if (stored && !snapshot.data) {
    return <BuilderPage view={view} />;
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
  return (
    <BuilderPage
      initialBuild={initialBuild}
      view={view}
      draftKey={DRAFT_KEY}
      onNewBuild={onNewBuild}
    />
  );
}
