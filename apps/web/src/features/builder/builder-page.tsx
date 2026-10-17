// apps/web/src/features/builder/builder-page.tsx
import { useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { presetAvailability, useProgression, useTasks, type BuildV6 } from "@tarkov/data";
import { Button } from "@tarkov/ui";
import { useWorkbenchChrome } from "../../site-chrome.js";
import { withModeTracking } from "../../observability/track-hooks.js";
import { adaptWeapon } from "../data-adapters/adapters.js";
import { BuildPanel } from "./build-panel.js";
import { writeDraft, type DraftBuild } from "./build-draft.js";
import { CompareFromBuildDialog } from "./compare/compare-from-build-dialog.js";
import { DetailsPanel } from "./details-panel.js";
import { ModeSwitch } from "./mode-switch.js";
import { OptimizeView } from "./optimize/optimize-view.js";
import { PresetSelect } from "./preset-select.js";
import { ProgressionPanel, ProgressionStatus } from "./progression-panel.js";
import { QuestNameProvider } from "./quest-names.js";
import { SlotInspector } from "./slot-inspector.js";
import { useSlotSelection } from "./slot-selection.js";
import { SnapshotBanner } from "./snapshot-banner.js";
import { StatStrip } from "./stat-strip.js";
import { applySyncedProfile } from "./synced-profile.js";
import { UpstreamDriftBanner } from "./upstream-drift-banner.js";
import { useBuilderState } from "./useBuilderState.js";
import { useCompareHandoff } from "./useCompareHandoff.js";
import { useSaveMetadata } from "./useSaveMetadata.js";
import { useShareBuild } from "./useShareBuild.js";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";
import { WeaponPicker } from "./weapon-picker.js";
import { WorkbenchBar } from "./workbench-bar.js";

export interface BuilderPageProps {
  /**
   * A saved build to open, already through `loadSavedBuild` (current version, every attachment
   * on the weapon). Its name, description and embedded profile seed the page too.
   */
  initialBuild?: BuildV6;
  notice?: React.ReactNode;
  view?: "editor" | "optimize";
  /**
   * Where the build is kept across reloads (`build-draft.ts`). Written on the first edit and
   * every one after; opening the page writes nothing. Omitted, nothing is kept.
   */
  draftKey?: string;
  /** Called after an edit has been written to {@link draftKey}. */
  onDraftWritten?: () => void;
  /** Offered as "New build" in the Details panel: discards this build and starts an empty one. */
  onNewBuild?: () => void;
}

/**
 * The `/builder` page. Composition only — the actual "what is this build" state lives in
 * `useBuilderState`, save metadata in `useSaveMetadata`, the share flow in `useShareBuild`,
 * and the compare handoff in `useCompareHandoff` (all in `features/builder/`). This function
 * used to hold all of that directly (12 `useState`, ~45 hook calls in one body); it was split
 * so each concern could be tested directly rather than only through the route.
 *
 * Lives here rather than in `routes/builder.tsx` (its only caller used to be that route's
 * own `component`) because `routes/builder.$id.tsx` also renders it directly, as a plain
 * function import rather than through the router. TanStack Router's `autoCodeSplitting`
 * (see `vite.config.ts`) can only split a route file's `component` into its own lazy chunk
 * when nothing else statically imports that identifier from the same module — with
 * `BuilderPage` previously defined *in* `routes/builder.tsx` and separately re-exported for
 * `builder.$id.tsx` to import, the splitter had to keep the whole implementation (this
 * component, its panels, `orphaned-banner`, `data-adapters`, …) in the eagerly-loaded entry
 * chunk for every route, including ones with nothing to do with the Builder — see Stage 5.3
 * of the plan doc for the measured before/after. Moving it to a plain feature module lets
 * both route files import it as a normal (non-route) dependency, which the splitter treats
 * like any other lazy-chunk-eligible import.
 */
export function BuilderPage({
  initialBuild,
  notice,
  view = "editor",
  draftKey,
  onDraftWritten,
  onNewBuild,
}: BuilderPageProps = {}) {
  const navigate = useNavigate();
  useWorkbenchChrome();

  // Every mode change this tab makes goes through these setters, so each sends mode_changed;
  // a change mirrored from another tab does not.
  const progression = withModeTracking(useProgression());
  const { profile, setProfile, mode } = progression;
  const tasks = useTasks();
  const sync = useTarkovTrackerSync({
    profile,
    onChange: (next, cause) => applySyncedProfile(progression, next, cause),
    tasks: tasks.data,
    tasksError: tasks.error,
  });

  const saveMeta = useSaveMetadata(initialBuild?.name, initialBuild?.description);

  const builder = useBuilderState({
    initialBuild,
    profile,
    mode,
    buildName: saveMeta.buildName,
    buildDescription: saveMeta.buildDescription,
    embedProfileOnSave: saveMeta.embedProfileOnSave,
  });

  useDraftWriter(
    draftKey,
    {
      weaponId: builder.weaponId,
      attachments: builder.attachments,
      orphaned: builder.orphaned,
      name: saveMeta.buildName,
      description: saveMeta.buildDescription,
    },
    onDraftWritten,
  );

  const weaponPresets = builder.weaponPresets;
  const nameOf = (id: string): string =>
    id === builder.selectedWeapon?.id
      ? builder.selectedWeapon.name
      : (builder.modNamesById[id] ?? id);
  const price = builder.buildPrice;
  const boughtAs =
    price !== null && price.status !== "unobtainable" && price.presetId !== null
      ? (weaponPresets.find((p) => p.id === price.presetId)?.shortName ?? price.presetId)
      : null;

  const shareBuild = useShareBuild({
    build: builder.selectedWeapon ? builder.currentBuild : null,
  });

  const sharedId = shareBuild.shareUrl?.split("/").pop() ?? null;

  const compareHandoff = useCompareHandoff({
    build: builder.currentBuild,
    gate: builder.gate,
  });

  const handleOpenOptimizer = () =>
    void navigate({ to: ".", search: (s) => ({ ...s, view: "optimize" as const }) });
  const handleExitOptimizer = () =>
    void navigate({ to: ".", search: (s) => ({ ...s, view: "editor" as const }) });
  const [progressionOpen, setProgressionOpen] = useState(false);
  const busyNoteId = useId();
  const busyId = sync.state === "syncing" ? busyNoteId : undefined;
  const openProgression = () => setProgressionOpen(true);

  const weapon = builder.selectedWeapon;
  const selection = useSlotSelection(builder.tree.data, builder.attachments);
  const selectedSlot = selection.selected?.slot ?? null;

  return (
    <QuestNameProvider>
      <WorkbenchBar
        picker={
          <WeaponPicker
            isLoading={builder.isLoading}
            weaponOptions={builder.weaponOptions}
            weaponId={builder.weaponId}
            onWeaponChange={builder.handleWeaponChange}
            mode={mode}
          />
        }
        modeSwitch={
          <ModeSwitch progression={progression} onOpenPanel={openProgression} busyId={busyId} />
        }
        onCompare={weapon ? compareHandoff.open : undefined}
        share={
          weapon
            ? {
                onShare: () => {
                  builder.commit();
                  shareBuild.share();
                },
                isSaving: shareBuild.isSaving,
                saveFailed: shareBuild.saveFailed,
                blocked: shareBuild.blocked,
                sharedId,
              }
            : undefined
        }
      />
      {weapon && builder.spec && (
        <StatStrip
          spec={builder.spec}
          stockSpec={builder.stockSpec}
          prices={builder.prices}
          buildPrice={builder.buildPrice}
          boughtAs={boughtAs}
          nameOf={nameOf}
          onOptimize={view === "editor" ? handleOpenOptimizer : undefined}
        />
      )}
      <ProgressionPanel
        open={progressionOpen}
        onClose={() => setProgressionOpen(false)}
        progression={progression}
        sync={sync}
        busyId={busyId}
      />
      <CompareFromBuildDialog
        open={compareHandoff.isOpen}
        onClose={compareHandoff.close}
        onConfirm={(result) => {
          builder.commit();
          compareHandoff.confirm(result);
        }}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <ProgressionStatus
          progression={progression}
          sync={sync}
          onOpenPanel={openProgression}
          busyId={busyId}
        />
        {view === "editor" ? (
          <>
            {notice}
            {builder.upstreamDriftInfo && <UpstreamDriftBanner {...builder.upstreamDriftInfo} />}
            <SnapshotBanner
              snapshot={initialBuild?.profileSnapshot}
              onUseSnapshot={setProfile}
              mode={mode}
            />

            {builder.error && (
              <p
                role="alert"
                className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm text-[var(--color-destructive)]"
              >
                Failed to load data: {builder.error.message}
              </p>
            )}

            <div className="flex flex-wrap items-start gap-4">
              <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 lg:max-w-[460px]">
                {weapon ? (
                  <BuildPanel
                    tree={builder.tree}
                    attachments={builder.attachments}
                    attachedCount={builder.attachedCount}
                    selection={selection}
                    getAvailability={(id) => builder.availabilityById.get(id) ?? null}
                    mode={mode}
                    getFittedConflict={builder.getFittedConflict}
                    orphaned={builder.orphaned}
                    modNames={builder.modNamesById}
                    onDismissOrphaned={builder.clearOrphaned}
                    missingRequired={builder.missingRequired}
                    conflicts={builder.conflicts}
                    presets={
                      builder.tree.data && (
                        // Keyed by weapon so a pending "Replace" prompt never outlives its weapon.
                        <PresetSelect
                          key={builder.weaponId}
                          presets={weaponPresets}
                          tree={builder.tree.data}
                          known={builder.partsById}
                          attachments={builder.attachments}
                          getAvailability={(id) => {
                            const preset = weaponPresets.find((p) => p.id === id);
                            return preset ? presetAvailability(preset, builder.gate) : null;
                          }}
                          mode={mode}
                          onApply={builder.applyPreset}
                        />
                      )
                    }
                  />
                ) : (
                  <section
                    aria-label="Build"
                    className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-strong)] px-4 py-10 text-center"
                  >
                    <h2 className="text-base font-bold">No weapon selected</h2>
                    <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                      Pick one in the weapon search above, or press{" "}
                      <kbd className="rounded-[var(--radius)] border border-[var(--color-border-strong)] px-1.5 font-mono text-12">
                        /
                      </kbd>{" "}
                      to jump to it.
                    </p>
                  </section>
                )}
              </div>
              <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
                {weapon && selectedSlot && (
                  <SlotInspector
                    weaponId={builder.weaponId}
                    id={selection.inspectorId}
                    slot={selectedSlot}
                    fittedId={builder.attachments[selectedSlot.path] ?? null}
                    parts={builder.partsById}
                    onAttach={builder.handleAttach}
                    getAvailability={(id) => builder.availabilityById.get(id) ?? null}
                    getConflict={builder.getConflict}
                    mode={mode}
                    pricesReady={builder.prices.state === "ready"}
                    onEscape={selection.focusTreeRow}
                  />
                )}
                <DetailsPanel
                  name={saveMeta.buildName}
                  description={saveMeta.buildDescription}
                  onNameChange={saveMeta.setBuildName}
                  onDescriptionChange={saveMeta.setBuildDescription}
                  spec={weapon ? builder.spec : null}
                  magazine={builder.magazine}
                  embedProfile={
                    weapon && mode === "progression"
                      ? {
                          checked: saveMeta.embedProfileOnSave,
                          onChange: saveMeta.setEmbedProfileOnSave,
                        }
                      : undefined
                  }
                  onNewBuild={
                    onNewBuild &&
                    (builder.weaponId !== "" || saveMeta.buildName || saveMeta.buildDescription)
                      ? onNewBuild
                      : undefined
                  }
                  dataAsOf={builder.dataAsOf}
                  prices={builder.prices}
                />
              </div>
            </div>
          </>
        ) : weapon && builder.tree.data && builder.spec ? (
          <OptimizeView
            weapon={adaptWeapon(weapon)}
            weaponItem={weapon}
            slotTree={builder.tree.data}
            parts={builder.parts}
            gate={builder.gate}
            presets={weaponPresets}
            pricesReady={builder.prices.state === "ready"}
            sync={sync}
            currentAttachments={builder.attachments}
            currentBuild={builder.currentBuild}
            currentStats={builder.spec}
            currentPrice={builder.buildPrice}
            onAccept={(build) => {
              builder.acceptOptimized(build.attachments);
              handleExitOptimizer();
            }}
            onExit={handleExitOptimizer}
            onEditProfile={openProgression}
          />
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-sm">Pick a weapon above to optimize.</p>
            <Button className="mt-3" size="sm" onClick={handleExitOptimizer}>
              ← Back to editor
            </Button>
          </div>
        )}

        {shareBuild.shareUrl && (
          <div
            role="status"
            className="fixed bottom-6 right-6 z-50 rounded-[var(--radius)] border bg-[var(--color-card)] p-4 shadow-lg"
          >
            <div className="text-sm font-medium">Build URL copied</div>
            <code className="mt-1 block max-w-xs truncate text-xs text-[var(--color-muted-foreground)]">
              {shareBuild.shareUrl}
            </code>
          </div>
        )}
      </div>
    </QuestNameProvider>
  );
}

/**
 * Write the build to `key` whenever it differs from what is already there: the build the page
 * opened with counts as already there, so opening a page (a draft restored, a shared build
 * loaded, or a corrupt draft ignored) writes nothing, and a corrupt value is only replaced by
 * an edit.
 */
function useDraftWriter(
  key: string | undefined,
  draft: DraftBuild,
  onWritten: (() => void) | undefined,
): void {
  // The build as one string: the effect below runs when it changes, and writes it as it was.
  const serialized = JSON.stringify(draft);
  const written = useRef(serialized);
  useEffect(() => {
    if (key === undefined || written.current === serialized) return;
    written.current = serialized;
    writeDraft(key, JSON.parse(serialized) as DraftBuild);
    onWritten?.();
  }, [key, serialized, onWritten]);
}
