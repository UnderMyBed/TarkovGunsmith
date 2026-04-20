import { useMemo } from "react";
import type { PlayerProfile } from "@tarkov/data";
import { useTasks, MARQUEE_QUEST_NORMALIZED_NAMES } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@tarkov/ui";

export interface ProfileEditorProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
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

export function ProfileEditor({ profile, onChange }: ProfileEditorProps) {
  const tasks = useTasks();

  const marqueeTasks = useMemo(() => {
    const allowed = new Set(MARQUEE_QUEST_NORMALIZED_NAMES);
    const byName = new Map((tasks.data ?? []).map((t) => [t.normalizedName, t]));
    return MARQUEE_QUEST_NORMALIZED_NAMES.map((slug) => ({
      slug,
      task: byName.get(slug),
    })).filter((entry) => allowed.has(entry.slug));
  }, [tasks.data]);

  const completedSet = new Set(profile.completedQuests ?? []);

  function setMode(mode: "basic" | "advanced") {
    onChange({ ...profile, mode });
  }

  function setTraderLevel(key: (typeof TRADER_KEYS)[number], level: number) {
    onChange({ ...profile, traders: { ...profile.traders, [key]: level } });
  }

  function setFlea(flea: boolean) {
    onChange({ ...profile, flea });
  }

  function toggleQuest(slug: string) {
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
        <details className="group">
          <summary className="cursor-pointer text-sm text-[var(--color-muted-foreground)] hover:opacity-80">
            Edit profile{" "}
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
                <span className="text-sm font-medium">Marquee quests</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {tasks.isLoading && "Loading quest list…"}
                  {tasks.error && "Couldn't load quest list — toggles still work."}
                </span>
                <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {marqueeTasks.map(({ slug, task }) => (
                    <li key={slug}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={completedSet.has(slug)}
                          onChange={() => toggleQuest(slug)}
                        />
                        <span>{task?.name ?? slug}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
