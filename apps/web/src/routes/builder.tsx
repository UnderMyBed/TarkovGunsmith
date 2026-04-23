import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useModList,
  useWeaponList,
  useSaveBuild,
  useWeaponTree,
  useProfile,
  useTasks,
  migrateV1ToV2,
  itemAvailability,
  CURRENT_BUILD_VERSION,
  type BuildV1,
  type BuildV4,
  type PlayerProfile,
  type SlotNodeForMigration,
} from "@tarkov/data";
import { useTarkovTrackerSync } from "../features/builder/useTarkovTrackerSync.js";
import { weaponSpec } from "@tarkov/ballistics";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { adaptMod, adaptWeapon } from "../features/data-adapters/adapters.js";
import { SlotTree } from "../features/builder/slot-tree.js";
import { OrphanedBanner } from "../features/builder/orphaned-banner.js";
import { ProfileEditor } from "../features/builder/profile-editor.js";
import { BuildHeader } from "../features/builder/build-header.js";
import { PresetPicker } from "../features/builder/preset-picker.js";
import {
  CompareFromBuildDialog,
  type CompareFromBuildConfirm,
} from "../features/builder/compare/compare-from-build-dialog.js";
import { OptimizeView } from "../features/builder/optimize/optimize-view.js";

const builderSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).optional(),
});

export const Route = createFileRoute("/builder")({
  component: BuilderRouteLayout,
  validateSearch: (s) => builderSearchSchema.parse(s),
});

/**
 * Layout wrapper for the `/builder` route tree.
 *
 * Child routes (`/builder/$id`, `/builder/compare`, `/builder/compare/$pairId`)
 * are nested under this file in TanStack's file-based routing tree, so the
 * parent must render an `<Outlet />` for them to mount. For the bare
 * `/builder` URL there is no matching child and we render the page itself.
 */
function BuilderRouteLayout() {
  const matchRoute = useMatchRoute();
  // `fuzzy: false` → only true when the current location is exactly `/builder`
  // with no child segments. Any deeper URL falls through to the `<Outlet />`.
  const isExactBuilder = matchRoute({ to: "/builder" });
  const search = Route.useSearch();
  return isExactBuilder ? <BuilderPage view={search.view} /> : <Outlet />;
}

export interface BuilderPageProps {
  initialWeaponId?: string;
  /** v1 hydration — flat list of mod ids. Will be migrated once the weapon tree loads. */
  initialModIds?: string[];
  /** v2 hydration — slot → item id map. */
  initialAttachments?: Record<string, string>;
  /** v2 hydration — unplaceable mods from an earlier v1 migration. */
  initialOrphaned?: string[];
  /** v3 hydration — profile snapshot embedded in the shared build. */
  initialProfileSnapshot?: PlayerProfile;
  /** v4 hydration — optional build name. */
  initialName?: string;
  /** v4 hydration — optional build description. */
  initialDescription?: string;
  notice?: React.ReactNode;
  view?: "editor" | "optimize";
}

export function BuilderPage({
  initialWeaponId = "",
  initialModIds,
  initialAttachments,
  initialOrphaned,
  initialProfileSnapshot,
  initialName,
  initialDescription,
  notice,
  view = "editor",
}: BuilderPageProps = {}) {
  const weapons = useWeaponList();
  const mods = useModList();
  const navigate = useNavigate();
  const [compareOpen, setCompareOpen] = useState(false);

  const [weaponId, setWeaponId] = useState<string>(initialWeaponId);
  const [attachments, setAttachments] = useState<Record<string, string>>(
    () => initialAttachments ?? {},
  );
  const [orphaned, setOrphaned] = useState<string[]>(() => initialOrphaned ?? []);

  const [profile, setProfile] = useProfile();
  const tasks = useTasks();
  const sync = useTarkovTrackerSync({ profile, onChange: setProfile, tasks: tasks.data });
  const [showAll, setShowAll] = useState(false);
  const [showAllWeapons, setShowAllWeapons] = useState(false);
  const [embedProfileOnSave, setEmbedProfileOnSave] = useState(false);
  const [snapshotBannerDismissed, setSnapshotBannerDismissed] = useState(false);

  const [buildName, setBuildName] = useState<string>(initialName ?? "");
  const [buildDescription, setBuildDescription] = useState<string>(initialDescription ?? "");

  const tree = useWeaponTree(weaponId);

  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    if (!initialModIds) return;
    if (!tree.data) return;
    const v1: BuildV1 = {
      version: 1,
      weaponId: initialWeaponId,
      modIds: initialModIds,
      createdAt: new Date(0).toISOString(),
    };
    // The tree's SlotNode structurally extends SlotNodeForMigration.
    const v2 = migrateV1ToV2(v1, tree.data.slots as unknown as readonly SlotNodeForMigration[]);
    setAttachments(v2.attachments);
    setOrphaned(v2.orphaned);
    migratedRef.current = true;
  }, [initialModIds, initialWeaponId, tree.data]);

  const weaponAvailabilityById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemAvailability>>();
    for (const w of weapons.data ?? []) {
      map.set(w.id, itemAvailability(w, profile));
    }
    return map;
  }, [weapons.data, profile]);

  const weaponOptions = useMemo(() => {
    if (!weapons.data) return [];
    const sorted = [...weapons.data].sort((a, b) => a.name.localeCompare(b.name));
    if (showAllWeapons) return sorted;
    return sorted.filter((w) => weaponAvailabilityById.get(w.id)?.available === true);
  }, [weapons.data, weaponAvailabilityById, showAllWeapons]);

  const selectedWeapon = useMemo(
    () => weapons.data?.find((w) => w.id === weaponId),
    [weapons.data, weaponId],
  );

  const selectedMods = useMemo(
    () => (mods.data ? mods.data.filter((m) => Object.values(attachments).includes(m.id)) : []),
    [mods.data, attachments],
  );

  const modNamesById = useMemo(
    () => Object.fromEntries((mods.data ?? []).map((m) => [m.id, m.name])),
    [mods.data],
  );

  const availabilityById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemAvailability>>();
    for (const m of mods.data ?? []) {
      map.set(m.id, itemAvailability(m, profile));
    }
    return map;
  }, [mods.data, profile]);

  const modSourcesById = useMemo(() => {
    const map = new Map<string, { hasCraft: boolean; hasBarter: boolean }>();
    for (const m of mods.data ?? []) {
      map.set(m.id, {
        hasCraft: (m.craftsFor?.length ?? 0) > 0,
        hasBarter: (m.bartersFor?.length ?? 0) > 0,
      });
    }
    return map;
  }, [mods.data]);

  const spec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), selectedMods.map(adaptMod));
  }, [selectedWeapon, selectedMods]);

  const stockSpec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), []);
  }, [selectedWeapon]);

  const upstreamDrift = useMemo(() => {
    // Only meaningful for loaded builds; fresh builds can't drift because they're built from current data.
    if (!initialWeaponId) return null;
    if (!weapons.data || !mods.data) return null;

    const missingWeapon = !weapons.data.some((w) => w.id === initialWeaponId);
    const knownModIds = new Set(mods.data.map((m) => m.id));
    const v1Missing = (initialModIds ?? []).filter((id) => !knownModIds.has(id));
    const v2Missing = Object.values(initialAttachments ?? {}).filter((id) => !knownModIds.has(id));
    const missingModIds = [...v1Missing, ...v2Missing];

    if (!missingWeapon && missingModIds.length === 0) return null;

    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-[var(--color-destructive)]">
            Some items in this build are no longer in the current game data.
            {missingWeapon && " The original weapon is missing."}
            {missingModIds.length > 0 &&
              ` ${missingModIds.length} mod${missingModIds.length === 1 ? "" : "s"} couldn't be resolved.`}{" "}
            Viewing what still exists.
          </p>
        </CardContent>
      </Card>
    );
  }, [initialWeaponId, initialModIds, initialAttachments, weapons.data, mods.data]);

  const saveMutation = useSaveBuild();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function handleShare() {
    if (!selectedWeapon) return;
    saveMutation.mutate(
      {
        version: CURRENT_BUILD_VERSION,
        weaponId: selectedWeapon.id,
        attachments,
        orphaned,
        createdAt: new Date().toISOString(),
        ...(embedProfileOnSave ? { profileSnapshot: profile } : {}),
        ...(buildName.trim().length > 0 ? { name: buildName.trim() } : {}),
        ...(buildDescription.trim().length > 0 ? { description: buildDescription.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          // Build the shareable URL from the SPA origin so it points at the /builder/$id
          // loader route, not the Worker's JSON endpoint.
          const shareableUrl = `${window.location.origin}/builder/${result.id}`;
          void navigator.clipboard.writeText(shareableUrl).catch(() => {
            // Clipboard permission denied — still show the URL so the user can copy manually.
          });
          setShareUrl(shareableUrl);
        },
      },
    );
  }

  useEffect(() => {
    if (!shareUrl) return;
    const id = window.setTimeout(() => setShareUrl(null), 5000);
    return () => window.clearTimeout(id);
  }, [shareUrl]);

  function handleCompareConfirm(result: CompareFromBuildConfirm) {
    // Persist the "left prefill" via sessionStorage so the /builder/compare
    // route can pick it up on mount. Small blob; cleared on consumption.
    const leftBuild = {
      version: CURRENT_BUILD_VERSION,
      weaponId,
      attachments,
      orphaned,
      createdAt: new Date().toISOString(),
      ...(embedProfileOnSave ? { profileSnapshot: profile } : {}),
      ...(buildName.trim().length > 0 ? { name: buildName.trim() } : {}),
      ...(buildDescription.trim().length > 0 ? { description: buildDescription.trim() } : {}),
    };
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
    sessionStorage.setItem("compare:mode", result.mode);
    if (result.mode === "paste-url") {
      sessionStorage.setItem("compare:rightBuildId", result.rightBuildId);
    } else {
      sessionStorage.removeItem("compare:rightBuildId");
    }
    void navigate({ to: "/builder/compare" });
  }

  function handleWeaponChange(newWeaponId: string) {
    setWeaponId(newWeaponId);
    setAttachments({});
    setOrphaned([]);
  }

  const currentBuild = useMemo<BuildV4>(
    () => ({
      version: 4,
      weaponId,
      attachments,
      orphaned,
      createdAt: new Date().toISOString(),
      ...(buildName.trim().length > 0 ? { name: buildName.trim() } : {}),
      ...(buildDescription.trim().length > 0 ? { description: buildDescription.trim() } : {}),
      ...(embedProfileOnSave ? { profileSnapshot: profile } : {}),
    }),
    [weaponId, attachments, orphaned, buildName, buildDescription, embedProfileOnSave, profile],
  );

  const currentPrice = useMemo(() => {
    if (!mods.data) return null;
    let total = 0;
    for (const id of Object.values(attachments)) {
      const m = mods.data.find((x) => x.id === id);
      const fleaPrice =
        (m?.buyFor ?? []).find((b) => b.vendor.__typename === "FleaMarket")?.priceRUB ?? 0;
      total += fleaPrice;
    }
    return total;
  }, [mods.data, attachments]);

  const handleOpenOptimizer = () =>
    void navigate({ to: ".", search: (s) => ({ ...s, view: "optimize" as const }) });
  const handleExitOptimizer = () =>
    void navigate({ to: ".", search: (s) => ({ ...s, view: "editor" as const }) });
  const handleEditProfile = () => {
    handleExitOptimizer();
    requestAnimationFrame(() => {
      document
        .querySelector("[data-profile-editor]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const isLoading = weapons.isLoading || mods.isLoading;
  const error = weapons.error ?? mods.error;

  return (
    <div className="flex flex-col gap-6">
      <BuildHeader
        name={buildName}
        description={buildDescription}
        onNameChange={setBuildName}
        onDescriptionChange={setBuildDescription}
        currentSpec={spec}
        stockSpec={stockSpec}
        weaponName={selectedWeapon?.shortName ?? selectedWeapon?.name ?? null}
        weaponId={weaponId || null}
        modCount={Object.keys(attachments).length}
        sharedId={shareUrl?.split("/").pop() ?? null}
        onCompare={selectedWeapon ? () => setCompareOpen(true) : undefined}
        onOptimize={selectedWeapon ? handleOpenOptimizer : undefined}
      />
      <CompareFromBuildDialog
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        onConfirm={handleCompareConfirm}
      />

      {view === "editor" ? (
        <>
          {notice}
          {upstreamDrift}

          {initialProfileSnapshot && !snapshotBannerDismissed && (
            <Card>
              <CardContent className="flex items-start justify-between gap-3 pt-6">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    This build was shared with a progression snapshot ({initialProfileSnapshot.mode}{" "}
                    mode).
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    Availability currently uses your saved profile. Switch to the author&apos;s
                    snapshot to see exactly what they had access to.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setProfile(initialProfileSnapshot);
                      setSnapshotBannerDismissed(true);
                    }}
                  >
                    Use author&apos;s profile
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSnapshotBannerDismissed(true)}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div data-profile-editor>
            <ProfileEditor profile={profile} onChange={setProfile} sync={sync} />
          </div>

          {error && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-[var(--color-destructive)]">
                  Failed to load data: {error.message}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Weapon</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Loading…"
                  : `${weaponOptions.length} weapons ${showAllWeapons ? "(all)" : "available on your profile"}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <select
                className="h-9 w-full rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                value={weaponId}
                onChange={(e) => handleWeaponChange(e.target.value)}
                disabled={isLoading || weaponOptions.length === 0}
              >
                <option value="">{isLoading ? "Loading…" : "Select weapon…"}</option>
                {weaponOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                <input
                  type="checkbox"
                  checked={showAllWeapons}
                  onChange={(e) => setShowAllWeapons(e.target.checked)}
                />
                <span>Show all weapons (including locked by profile)</span>
              </label>
              {selectedWeapon && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <Button onClick={handleShare} disabled={saveMutation.isPending} size="sm">
                      {saveMutation.isPending ? "Saving…" : "Share build"}
                    </Button>
                    {saveMutation.error && (
                      <span className="text-sm text-[var(--color-destructive)]">
                        Couldn&apos;t save — try again
                      </span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                    <input
                      type="checkbox"
                      checked={embedProfileOnSave}
                      onChange={(e) => setEmbedProfileOnSave(e.target.checked)}
                    />
                    <span>Embed my progression snapshot in the shared URL</span>
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedWeapon && (
            <PresetPicker
              weaponId={selectedWeapon.id}
              onApply={(next) => {
                setAttachments({ ...next });
                setOrphaned([]);
              }}
            />
          )}

          {selectedWeapon && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Mods</CardTitle>
                      <CardDescription>
                        {tree.isLoading && "Loading slot tree…"}
                        {tree.error && (
                          <span className="text-[var(--color-destructive)]">
                            Couldn&apos;t load slot tree: {tree.error.message}
                          </span>
                        )}
                        {tree.data && `${Object.keys(attachments).length} attached`}
                      </CardDescription>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={showAll}
                        onChange={(e) => setShowAll(e.target.checked)}
                      />
                      <span>Show all items</span>
                    </label>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {tree.data && (
                    <SlotTree
                      tree={tree.data}
                      attachments={attachments}
                      onAttach={(path, itemId) =>
                        setAttachments((prev) => {
                          const next = { ...prev };
                          if (itemId === null) delete next[path];
                          else next[path] = itemId;
                          return next;
                        })
                      }
                      getAvailability={(id) => availabilityById.get(id) ?? null}
                      getModSources={(id) =>
                        modSourcesById.get(id) ?? { hasCraft: false, hasBarter: false }
                      }
                      showAll={showAll}
                    />
                  )}
                  <OrphanedBanner
                    orphanedIds={orphaned}
                    names={modNamesById}
                    onDismiss={() => setOrphaned([])}
                  />
                </CardContent>
              </Card>

              {spec && (
                <Card>
                  <CardHeader>
                    <CardTitle>Spec</CardTitle>
                    <CardDescription>
                      <code>{selectedWeapon.shortName}</code> with {spec.modCount} mod
                      {spec.modCount === 1 ? "" : "s"}
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
              )}
            </>
          )}
        </>
      ) : selectedWeapon && tree.data && spec ? (
        <OptimizeView
          weapon={adaptWeapon(selectedWeapon)}
          slotTree={tree.data}
          modList={mods.data ?? []}
          profile={profile}
          sync={sync}
          currentAttachments={attachments}
          currentBuild={currentBuild}
          currentStats={spec}
          currentPrice={currentPrice}
          onAccept={(build) => {
            setAttachments(build.attachments);
            setOrphaned(build.orphaned);
            handleExitOptimizer();
          }}
          onExit={handleExitOptimizer}
          onEditProfile={handleEditProfile}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">Pick a weapon in the editor before running the optimizer.</p>
            <Button className="mt-3" size="sm" onClick={handleExitOptimizer}>
              ← Back to editor
            </Button>
          </CardContent>
        </Card>
      )}

      {shareUrl && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-[var(--radius)] border bg-[var(--color-card)] p-4 shadow-lg"
        >
          <div className="text-sm font-medium">Build URL copied</div>
          <code className="mt-1 block max-w-xs truncate text-xs text-[var(--color-muted-foreground)]">
            {shareUrl}
          </code>
        </div>
      )}
    </div>
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
