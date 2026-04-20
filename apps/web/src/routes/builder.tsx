import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useModList, useWeaponList, useSaveBuild, CURRENT_BUILD_VERSION } from "@tarkov/data";
import type { ModListItem } from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@tarkov/ui";
import { adaptMod, adaptWeapon } from "../features/data-adapters/adapters.js";

export const Route = createFileRoute("/builder")({
  component: BuilderPage,
});

export interface BuilderPageProps {
  initialWeaponId?: string;
  initialModIds?: string[];
  notice?: React.ReactNode;
}

export function BuilderPage({
  initialWeaponId = "",
  initialModIds,
  notice,
}: BuilderPageProps = {}) {
  const weapons = useWeaponList();
  const mods = useModList();

  const [weaponId, setWeaponId] = useState<string>(initialWeaponId);
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(
    () => new Set(initialModIds ?? []),
  );
  const [modSearch, setModSearch] = useState<string>("");

  const weaponOptions = useMemo(
    () => (weapons.data ? [...weapons.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [weapons.data],
  );

  const selectedWeapon = useMemo(
    () => weapons.data?.find((w) => w.id === weaponId),
    [weapons.data, weaponId],
  );

  const filteredMods = useMemo(() => {
    if (!mods.data) return [];
    const search = modSearch.toLowerCase();
    const list = search
      ? mods.data.filter(
          (m) =>
            m.name.toLowerCase().includes(search) || m.shortName.toLowerCase().includes(search),
        )
      : mods.data;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [mods.data, modSearch]);

  const selectedMods = useMemo(
    () => (mods.data ? mods.data.filter((m) => selectedModIds.has(m.id)) : []),
    [mods.data, selectedModIds],
  );

  const spec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), selectedMods.map(adaptMod));
  }, [selectedWeapon, selectedMods]);

  const upstreamDrift = useMemo(() => {
    // Only meaningful for loaded builds; fresh builds can't drift because they're built from current data.
    if (!initialWeaponId) return null;
    if (!weapons.data || !mods.data) return null;

    const missingWeapon = !weapons.data.some((w) => w.id === initialWeaponId);
    const knownModIds = new Set(mods.data.map((m) => m.id));
    const missingModIds = (initialModIds ?? []).filter((id) => !knownModIds.has(id));

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
  }, [initialWeaponId, initialModIds, weapons.data, mods.data]);

  const saveMutation = useSaveBuild();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function handleShare() {
    if (!selectedWeapon) return;
    saveMutation.mutate(
      {
        version: CURRENT_BUILD_VERSION,
        weaponId: selectedWeapon.id,
        modIds: [...selectedModIds],
        createdAt: new Date().toISOString(),
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

  function toggleMod(modId: string) {
    setSelectedModIds((prev) => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  }

  function clearMods() {
    setSelectedModIds(new Set());
  }

  const isLoading = weapons.isLoading || mods.isLoading;
  const error = weapons.error ?? mods.error;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Weapon Builder</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Pick a weapon, attach mods, see live <code>weaponSpec</code> output (ergonomics, recoil,
          weight, accuracy). v0.12.0 includes only mods with ergo/recoil/accuracy deltas (
          <code>ItemPropertiesWeaponMod</code>); slot-based compatibility comes in a follow-up.
        </p>
      </section>
      {notice}
      {upstreamDrift}

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-[var(--color-destructive)]">Failed to load data: {error.message}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Weapon</CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${weaponOptions.length} weapons available`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <select
            className="h-9 w-full rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
            value={weaponId}
            onChange={(e) => {
              setWeaponId(e.target.value);
              clearMods();
            }}
            disabled={isLoading || weaponOptions.length === 0}
          >
            <option value="">{isLoading ? "Loading…" : "Select weapon…"}</option>
            {weaponOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {selectedWeapon && (
            <div className="flex items-center gap-3">
              <Button onClick={handleShare} disabled={saveMutation.isPending} size="sm">
                {saveMutation.isPending ? "Saving…" : "Share build"}
              </Button>
              {saveMutation.error && (
                <span className="text-sm text-[var(--color-destructive)]">
                  Couldn't save — try again
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedWeapon && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mods</CardTitle>
                  <CardDescription>
                    {selectedModIds.size} attached · {filteredMods.length} matching
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearMods}
                  disabled={selectedModIds.size === 0}
                >
                  Clear all
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input
                type="search"
                placeholder="Filter mods by name or shortName…"
                value={modSearch}
                onChange={(e) => setModSearch(e.target.value)}
              />
              <div className="max-h-96 overflow-y-auto rounded-[var(--radius)] border">
                {filteredMods.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--color-muted-foreground)]">No mods match.</p>
                ) : (
                  <ul className="divide-y">
                    {filteredMods.slice(0, 200).map((mod) => (
                      <ModRow
                        key={mod.id}
                        mod={mod}
                        checked={selectedModIds.has(mod.id)}
                        onToggle={() => toggleMod(mod.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
              {filteredMods.length > 200 && (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Showing first 200 of {filteredMods.length} matches — refine your search.
                </p>
              )}
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

function ModRow({
  mod,
  checked,
  onToggle,
}: {
  mod: ModListItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 p-2 hover:bg-[var(--color-accent)]">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4" />
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm">{mod.name}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            ergo {fmt(mod.properties.ergonomics)} · recoil {fmt(mod.properties.recoilModifier)}
            {mod.properties.recoilModifier !== 0 ? "%" : ""} · {mod.weight.toFixed(2)} kg
          </div>
        </div>
      </label>
    </li>
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

function fmt(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}
