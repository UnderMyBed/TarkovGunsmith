import { useMemo, useState, type ReactElement } from "react";
import type { PlayerProfile } from "@tarkov/data";
import { useTasks, MARQUEE_QUEST_NORMALIZED_NAMES } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { TarkovTrackerConnectPopover } from "./tarkovtracker-connect-popover.js";
import { TarkovTrackerSyncBanner } from "./tarkovtracker-sync-banner.js";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

export interface ProfileEditorProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  sync: UseTarkovTrackerSyncResult;
}

const TRADER_KEYS = [
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
] as const;

const TRADER_LABELS: Record<(typeof TRADER_KEYS)[number], string> = {
  prapor: "Prapor",
  therapist: "Therapist",
  skier: "Skier",
  peacekeeper: "Peacekeeper",
  mechanic: "Mechanic",
  ragman: "Ragman",
  jaeger: "Jaeger",
};

type QuestFilter = "all" | "marquee" | "incomplete";

export function ProfileEditor({ profile, onChange, sync }: ProfileEditorProps): ReactElement {
  const tasks = useTasks();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filter, setFilter] = useState<QuestFilter>("marquee");
  const [search, setSearch] = useState("");

  const marqueeSet = useMemo(() => new Set<string>(MARQUEE_QUEST_NORMALIZED_NAMES), []);
  const completedSet = new Set(profile.completedQuests ?? []);

  const allTasks = tasks.data ?? [];
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTasks
      .filter((t) => {
        if (filter === "marquee" && !marqueeSet.has(t.normalizedName)) return false;
        if (filter === "incomplete" && completedSet.has(t.normalizedName)) return false;
        if (q.length > 0 && !t.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 200);
  }, [allTasks, filter, search, marqueeSet, completedSet]);

  const marqueeDoneCount = useMemo(
    () => Array.from(marqueeSet).filter((slug) => completedSet.has(slug)).length,
    [marqueeSet, completedSet],
  );
  const totalDoneCount = completedSet.size;

  function setMode(mode: "basic" | "advanced"): void {
    onChange({ ...profile, mode });
  }

  function setTraderLevel(key: (typeof TRADER_KEYS)[number], level: number): void {
    onChange({ ...profile, traders: { ...profile.traders, [key]: level } });
  }

  function setFlea(flea: boolean): void {
    onChange({ ...profile, flea });
  }

  function toggleQuest(slug: string): void {
    const next = new Set(completedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange({ ...profile, completedQuests: [...next] });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Your progression</CardTitle>
            <CardDescription>
              Dims mods you can&apos;t acquire yet and shows the blocking requirement.
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-[var(--radius)] border p-1">
            <Button
              type="button"
              size="sm"
              variant={profile.mode === "basic" ? "default" : "ghost"}
              onClick={() => setMode("basic")}
            >
              Basic
            </Button>
            <Button
              type="button"
              size="sm"
              variant={profile.mode === "advanced" ? "default" : "ghost"}
              onClick={() => setMode("advanced")}
            >
              Advanced
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {profile.mode === "advanced" && (
          <div className="mb-3">
            {sync.state === "disconnected" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPopoverOpen(true)}>
                ▲ Connect TarkovTracker
              </Button>
            ) : (
              <TarkovTrackerSyncBanner sync={sync} />
            )}
          </div>
        )}

        <details className="group">
          <summary className="cursor-pointer text-sm text-[var(--color-muted-foreground)] hover:opacity-80">
            {sync.state === "synced" ? "Override manually" : "Edit profile"}{" "}
            <span className="ml-1 inline-block transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRADER_KEYS.map((key) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{TRADER_LABELS[key]}</span>
                  <select
                    className="h-8 rounded-[var(--radius)] border bg-[var(--color-input)] px-2 text-sm"
                    value={profile.traders[key]}
                    onChange={(e) => setTraderLevel(key, Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((ll) => (
                      <option key={ll} value={ll}>
                        LL {ll}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.flea}
                onChange={(e) => setFlea(e.target.checked)}
              />
              <span>Flea market access</span>
            </label>

            {profile.mode === "advanced" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Quests{" "}
                    <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                      — {totalDoneCount} complete
                    </span>
                  </span>
                  {tasks.isLoading && (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      Loading quest list…
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter quests…"
                  className="h-8 rounded-[var(--radius)] border bg-[var(--color-input)] px-2 text-sm"
                />
                <div className="flex gap-1 text-xs">
                  {(
                    [
                      ["all", "All"],
                      [
                        "marquee",
                        `Marquee (${marqueeDoneCount}/${MARQUEE_QUEST_NORMALIZED_NAMES.length})`,
                      ],
                      ["incomplete", "Incomplete"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`border px-2 py-0.5 font-mono uppercase tracking-wider ${
                        filter === key
                          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                          : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tasks.error && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Couldn&apos;t load quest list — toggles still work against cached slugs.
                  </span>
                )}
                <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {visibleTasks.map((t) => (
                    <li key={t.normalizedName}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={completedSet.has(t.normalizedName)}
                          onChange={() => toggleQuest(t.normalizedName)}
                        />
                        <span>{t.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {sync.state === "synced" && (
                  <p className="text-xs italic text-[var(--color-muted-foreground)]">
                    Manual toggles override the TarkovTracker snapshot until the next Re-sync.
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
      </CardContent>

      <TarkovTrackerConnectPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        onConnect={(token) => {
          setPopoverOpen(false);
          void sync.connect(token);
        }}
      />
    </Card>
  );
}
