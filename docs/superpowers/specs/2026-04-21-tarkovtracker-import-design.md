# TarkovTracker profile import — design

**Status:** approved 2026-04-21
**Milestone:** M3 differentiator #5 (final).
**Ships:** one PR — `feat/m3-tarkovtracker-import`.

## 1. Goal

The `/builder` Advanced profile editor currently asks users to hand-toggle 20 curated "marquee" quests to populate `PlayerProfile.completedQuests`. Users who track their actual progression already do that work in [TarkovTracker](https://tarkovtracker.io) — a community app that records completed tasks, hideout modules, player level, and more.

This spec ships a one-click "Connect TarkovTracker" flow that pulls the user's live progression into the SPA, auto-filling `completedQuests` + `flea`. The user no longer manually toggles quests (unless they want to override the imported state).

## 2. Scope

In scope:

- One new client-side module in `packages/tarkov-data/src/tarkovtracker/` — API client, response mapping, quest-ID resolution, zod schemas, unit tests.
- Two UI components in `apps/web/src/features/builder/` — a Connect popover (first-run token entry) and a sync banner (steady state).
- A `useTarkovTrackerSync` hook that owns the import state machine and persists the token in localStorage.
- `ProfileEditor` rework — the imported-progression layout (see §5) replaces the 20-quest marquee list with a search + filter-pills UX over the full quest dataset.
- Playwright smoke test with a mocked TarkovTracker response.
- No schema changes. `PlayerProfile` and `BuildV4` shapes unchanged.
- No new Pages Function or Worker. `https://tarkovtracker.io/api/v2` has CORS enabled for all origins (verified from their source at `functions/api/v2/index.js`).

Non-goals:

- **Trader-LL derivation from completed quests.** TarkovTracker's API does not return per-trader LLs. Deriving them requires walking `api.tarkov.dev`'s `Trader.levels[].taskUnlock` against the imported `completedQuests` — solvable, but a separate mapping surface + test matrix. Trader LL inputs stay manual in v1; auto-derivation tracked as a follow-up.
- **Hideout level import.** Our `itemAvailability` logic doesn't consult hideout state.
- **Team progression** (`TP` scope, `GET /team/progress`). Only useful if we build a "view teammate's progression" feature; not on the roadmap.
- **Writing back to TarkovTracker** (`WP` scope).
- **Background / periodic auto-sync.** Only explicit user-triggered re-syncs.
- **Token rotation / OAuth.** Personal bearer tokens only (TarkovTracker's native model).
- **Settings panel for the token.** Lives inline in the ProfileEditor card; no separate route or modal.

## 3. TarkovTracker API reference

Confirmed from [github.com/TarkovTracker/TarkovTracker](https://github.com/TarkovTracker/TarkovTracker) at commit `2ef0b3e`:

- **Base URL:** `https://tarkovtracker.io/api/v2`
- **Auth:** `Authorization: Bearer <token>`
- **Scopes:** `GP` (Get Progression), `TP` (Team Progression), `WP` (Write). We need `GP`.
- **Endpoint:** `GET /api/v2/progress`
- **CORS:** `app.use(cors({ origin: true }))` — all origins allowed.
- **Response shape** (via `formatProgress()` in `functions/api/v2/index.js`):

```ts
interface RawProgression {
  tasksProgress: Array<{ id: string; complete: boolean; invalid?: boolean; failed?: boolean }>;
  taskObjectivesProgress: Array<{ id: string; complete: boolean; invalid?: boolean }>;
  hideoutModulesProgress: Array<{ id: string; complete: boolean }>;
  hideoutPartsProgress: Array<{ id: string; complete: boolean; count?: number }>;
  displayName: string;
  userId: string;
  playerLevel: number;
  gameEdition: 1 | 2 | 3 | 4; // 1=Standard … 4=EOD
  pmcFaction: "USEC" | "BEAR";
}
```

`tasksProgress[].id` is the BSG gameId (MongoDB-style 24-char hex), which matches `api.tarkov.dev`'s `Task.id` one-to-one.

Error codes observed in source: `401` (missing or invalid token), `400` (malformed Authorization header). `429` and `5xx` are possible from Cloudflare in front of TarkovTracker. No documented rate limits.

## 4. Architecture

### 4.1 New files

```
packages/tarkov-data/src/tarkovtracker/
  index.ts                     — public barrel exports
  client.ts                    — fetchProgression(token) → RawProgression; throws typed errors
  mapping.ts                   — RawProgression + Task[] → Partial<PlayerProfile> + warnings
  types.ts                     — zod schema for RawProgression
  quest-id-map.ts              — buildIdMap(Task[]) → Record<gameId, normalizedName>
  errors.ts                    — TokenInvalidError | RateLimitedError | NetworkError | ShapeMismatchError
  __fixtures__/raw-progression.json  — 3-task fixture for unit + e2e tests
  client.test.ts
  mapping.test.ts
  quest-id-map.test.ts
  types.test.ts

apps/web/src/features/builder/
  tarkovtracker-connect-popover.tsx    — first-run token entry
  tarkovtracker-sync-banner.tsx        — synced / syncing / error states
  useTarkovTrackerSync.ts              — state machine + localStorage + fetch pipeline
  useTarkovTrackerSync.test.tsx        — hook tests with mocked client
```

### 4.2 Modified files

```
apps/web/src/features/builder/profile-editor.tsx
  — replaces the 20-quest <ul> with a banner slot + search + filter pills + expandable full-list
apps/web/e2e/smoke.spec.ts
  — adds one "TarkovTracker Connect" smoke with mocked /progress endpoint
apps/web/e2e/fixtures/tarkovtracker-progression.json
  — fixture for the e2e mock
```

### 4.3 Data flow

1. User opens `/builder`, clicks Advanced, opens the profile editor.
2. If no token in `localStorage["tg:tarkovtracker-token"]`, banner slot shows `<ConnectPopover>` trigger button.
3. User clicks Connect → popover opens with a masked input, instructions, a "Get a token →" link to `https://tarkovtracker.io/settings`.
4. User pastes token, clicks Connect → `useTarkovTrackerSync.connect(token)` is called.
5. Hook writes token to localStorage, transitions to `syncing`, calls `fetchProgression(token)`.
6. Client awaits `useTasks.data` (the SPA's existing full task list from `api.tarkov.dev`). If not yet loaded, banner shows `LOADING QUEST DATA…` until it resolves.
7. Client calls `mapRawToProfile(raw, tasks)` → `{ completedQuests: normalizedName[], flea: boolean, unmappedCount: number }`.
8. Hook calls `onChange({ ...profile, ...imported })` using ProfileEditor's existing prop.
9. Hook transitions to `synced`, stores `{ lastSyncedAt, questCount, playerLevel, unmappedCount }` in React state.
10. Banner re-renders: `▲ TARKOVTRACKER · 184 QUESTS · PMC LV 42`.

### 4.4 State machine

Owned by `useTarkovTrackerSync`:

| State          | Meaning                                                     |
| -------------- | ----------------------------------------------------------- |
| `disconnected` | No token in localStorage                                    |
| `syncing`      | Fetch in flight                                             |
| `synced`       | Last fetch succeeded; banner shows counts                   |
| `error`        | Last fetch failed; banner shows error copy + primary action |

Transitions:

```
disconnected  —connect(token)→   syncing  —success→   synced
                                    └────error→   error
synced        —reSync()→          syncing (same outcomes)
synced        —disconnect()→      disconnected  (clears token, keeps applied profile)
error         —connect / reSync→  syncing
```

Re-sync cooldown: client-side 10-second debounce after a successful sync. A `429` response flips to `error` with `kind: "rate-limited"` and disables Re-sync for 60 s.

## 5. UI

### 5.1 Steady state (synced, layout B from the mockup)

`ProfileEditor` card header keeps the existing `Basic / Advanced` toggle. Below it, when Advanced:

- **Sync banner** (when `state === "synced"`): amber left-border, warm-black fill.
  - Top line (mono, amber, uppercase): `▲ TARKOVTRACKER · {questCount} QUESTS · PMC LV {playerLevel}`
  - Sub line (paper-dim): `Last sync {relative-time}. Trader LLs not synced — set manually.`
  - Right-side actions: `Re-sync` (primary), `Disconnect` (ghost).
  - If `unmappedCount > 0`, append muted `· {n} unmapped — likely new this patch.`
- **Collapsed "Override manually" `<details>`**:
  - Trader LL grid (unchanged — 7 dropdowns).
  - Flea checkbox — shows `✓ synced` next to the label if `flea` came from the import.
  - Quest section: `Quests — {complete} / {total} complete`, a search input, filter pills (`ALL`, `MARQUEE (n/20)`, `INCOMPLETE (n)`), two-column list of checkboxes. Synced-complete quests render in olive (`#7a8b3f`); manually toggled quests since last sync render in default paper with a subtle underline.
  - Microcopy below list: `Manual toggles override the TarkovTracker snapshot until the next Re-sync.`

### 5.2 Disconnected state

Sync banner slot replaced by a compact `<Button>`:

```
[ ▲ Connect TarkovTracker ]    — amber outline, mono caps
```

Click → `<ConnectPopover>` opens anchored to the button.

### 5.3 Connect popover content

```
TarkovTracker token
[  •••••••••  ]  [show]

1. Open tarkovtracker.io/settings →
2. Create a token with "Get Progression" scope
3. Paste it above

Stored in your browser only. We never send it to
the TarkovGunsmith servers.

[ Connect ]  [ Cancel ]
```

Token input is `type="password"` by default with a "show" toggle. Paste works natively. Two footer links: `Get a token →` (opens `https://tarkovtracker.io/settings` in a new tab), `Privacy` (inline copy: `Token lives in localStorage. Disconnect to clear.`).

### 5.4 Error states

| `error.kind`     | Banner copy                                                                                                   | Primary action                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `token-invalid`  | `Token rejected — check you copied it correctly and that it has "Get Progression" scope.`                     | `Disconnect` (recommended) + re-enter |
| `network`        | `Can't reach TarkovTracker. Your local profile is unchanged — try Re-sync in a minute.`                       | `Re-sync` enabled                     |
| `rate-limited`   | `TarkovTracker is rate-limiting us. Try again shortly.`                                                       | `Re-sync` disabled for 60 s           |
| `shape-mismatch` | `TarkovTracker changed its API shape. This tool needs an update — please file an issue.` + GitHub issues link | `Disconnect`                          |

The banner flips red-border in `error` state.

## 6. Mapping

### 6.1 Happy path

```ts
function mapRawToProfile(raw: RawProgression, tasks: readonly Task[]): MapResult {
  const idMap = buildIdMap(tasks); // gameId → normalizedName
  const normalized: string[] = [];
  let unmappedCount = 0;

  for (const entry of raw.tasksProgress) {
    if (!entry.complete || entry.invalid || entry.failed) continue;
    const slug = idMap[entry.id];
    if (slug) normalized.push(slug);
    else unmappedCount++;
  }

  return {
    profile: {
      completedQuests: normalized,
      flea: raw.playerLevel >= 20,
    },
    meta: {
      questCount: normalized.length,
      playerLevel: raw.playerLevel,
      unmappedCount,
    },
  };
}
```

### 6.2 Filter semantics

- `complete === false` → skip (not done).
- `invalid === true` → skip (wrong faction or pre-empted by an alternative quest).
- `failed === true` → skip (failed timer / chain).
- Else → add to `completedQuests` if the gameId resolves.

## 7. Token storage + security

- Key: `localStorage["tg:tarkovtracker-token"]`.
- Scope is client-side only. Never sent to the TarkovGunsmith Workers or embedded in shared `BuildV4` records.
- Cleared on `Disconnect`.
- Not rotated / refreshed by us — user manages in TarkovTracker.
- No PII beyond the token. No analytics / telemetry on the sync event.

A shared-device user risk exists (anyone on the same browser profile can read the token from DevTools and impersonate). Mitigation: the Disconnect button is prominent; the copy next to the token input explicitly calls out the storage model. Acceptable for a hobby tool; documented.

## 8. Testing

### 8.1 Unit tests (`packages/tarkov-data/src/tarkovtracker/`)

- **`client.test.ts`** (4 tests, mocked `fetch`): happy path, 401, 429, network rejection.
- **`mapping.test.ts`** (5 tests, pure): 3 complete + 2 excluded, `flea: false` at level < 20, `invalid` filter, `failed` filter, unmapped-count reporting.
- **`quest-id-map.test.ts`** (2 tests): correct count, duplicate gameId handled.
- **`types.test.ts`** (2 tests): valid payload parses, missing field throws with path.

13 new `@tarkov/data` tests.

### 8.2 Hook tests (`apps/web/src/features/builder/`)

- **`useTarkovTrackerSync.test.tsx`** (4 tests with mocked client):
  - No token → `disconnected`.
  - `connect(token)` → `disconnected → syncing → synced`, token in localStorage, `onChange` called with merged profile.
  - Failed fetch → `error` state; token stays in localStorage so the user can retry without re-pasting.
  - `disconnect()` → token removed, state resets to `disconnected`, profile untouched.

### 8.3 Playwright smoke (`apps/web/e2e/smoke.spec.ts`)

1 new test:

```ts
test("/builder — TarkovTracker Connect populates completedQuests", async ({ page }) => {
  await page.route("https://tarkovtracker.io/api/v2/progress", (route) =>
    route.fulfill({ json: fixtureRawProgression }),
  );
  await page.goto("/builder");
  // ... open Advanced, open profile editor, click Connect, paste "fake-token", click Connect.
  //     assert the sync banner text includes "3 QUESTS · PMC LV 25" (per fixture).
});
```

Fixture at `apps/web/e2e/fixtures/tarkovtracker-progression.json` — 3 completed tasks with real BSG gameIds that match `api.tarkov.dev`'s task list.

No real-API e2e (ratelimit-fragile, no value over mock).

## 9. Rollout

**One PR** — `feat/m3-tarkovtracker-import`. Commit groups inside:

1. `feat(data): @tarkov/data/tarkovtracker — client + mapping (pure)` — new module + 13 unit tests. Deployable no-op.
2. `feat(web): useTarkovTrackerSync hook + connect popover + sync banner` — UI primitives + 4 hook tests. Unimported by routes.
3. `feat(web): ProfileEditor — imported-progression mode (layout B)` — wires everything in. User-visible.
4. `test(web): Playwright smoke — TarkovTracker Connect flow` — mocked-route e2e.

After merge: release-please opens v1.10.0 PR. User merges to promote.

Post-deploy verification: paste a real TarkovTracker token into prod `/builder` Advanced mode, verify the banner populates, verify availability dimming respects the synced `completedQuests`.

## 10. Risks + open questions

- **TarkovTracker response shape changes.** Zod schema catches this and flips to the `shape-mismatch` error state. Not silent.
- **`api.tarkov.dev` task list lags a patch.** A new quest completed in TarkovTracker but not yet in tarkov.dev will appear as `unmapped`. Banner surfaces a count; no action needed — user re-syncs after tarkov.dev catches up.
- **TarkovTracker adds a rate limit.** We ratelimit client-side optimistically (10s cooldown on success, 60s on 429). If they impose something stricter, users will see the `rate-limited` banner and wait.
- **CORS is turned off by TarkovTracker.** Extremely unlikely given their source explicitly enables all origins, but if it happened we'd add a thin Pages Function proxy at `apps/web/functions/api/tarkovtracker/progression.ts`. Not in this PR.
- **Token in localStorage.** Documented above (§7); acceptable for the use case.

## 11. References

- Mockup source (Field Ledger layout B): `.superpowers/brainstorm/*/content/profile-ui-comparison.html` (`data-choice="import"`).
- TarkovTracker API source: [`TarkovTracker/TarkovTracker/functions/api/v2/index.js`](https://github.com/TarkovTracker/TarkovTracker/blob/main/functions/api/v2/index.js) at commit `2ef0b3e`.
- `PlayerProfile` schema: `packages/tarkov-data/src/build-schema.ts`.
- `itemAvailability`: `packages/tarkov-data/src/item-availability.ts`.
- `useTasks`: `packages/tarkov-data/src/queries/tasks.ts`.
- Current ProfileEditor: `apps/web/src/features/builder/profile-editor.tsx`.
