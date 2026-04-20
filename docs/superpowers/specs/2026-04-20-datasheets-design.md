# DataSheets (`/data`)

**Status:** design approved 2026-04-20 · fourth M2 feature.
**Depends on:** existing `@tarkov/data` hooks (`useAmmoList`, `useArmorList`, `useWeaponList`, `useModList`).
**Part of:** rebuild design §13 Milestone 2.

## 1. Context

Spec §13 calls for "Full DataSheets: weapons, ammo, armor, modules." Users want a reference table to browse raw stats when building loadouts. No math — just data presentation.

## 2. Goals

- **One route, four tabs.** `/data` with in-memory tab state. Avoids 4 separate routes and nav clutter.
- **Sortable + searchable.** Click a column header to sort; type to filter by name.
- **Reuses existing hooks.** No new queries.
- **Single PR.** Smaller than a multi-route arc.

## 3. Non-goals

- Trader prices / flea comparison — future.
- Favourites / comparison — future.
- Export to CSV.
- Pagination / virtualisation — data volumes fit comfortably in the DOM.

## 4. Route `/data`

### 4.1 Layout

- Tab bar: Ammo | Armor | Weapons | Modules.
- Search input (filter by name).
- Table with sortable columns:
  - **Ammo:** name, caliber (derived from ammo id / parent — best-effort for v1 or omitted), pen, damage, armor damage %, projectiles.
  - **Armor:** name, class, durability, material, zones.
  - **Weapons:** name, caliber, ergo, recoil V, recoil H, weight, fire rate.
  - **Modules:** name, recoil %, ergo Δ, weight, accuracy Δ.

Note: ammo caliber isn't in our current `AmmoListItem` schema — omit caliber column from the Ammo tab in v1.

### 4.2 State

Local `useState` for active tab + search text + per-tab sort config (column + direction).

### 4.3 Helpers

- `filterRowsByName(rows, query) → rows` — case-insensitive substring on `name`.
- `sortRows<T>(rows, key, direction) → rows` — generic sort on a given key. Stable.

## 5. Testing

- Unit tests for `filterRowsByName` + `sortRows`.
- No component tests.
- Manual browser verification.

## 6. Known follow-ups

- Column filters (class, caliber).
- Row selection + cross-route linking (select an ammo → open `/calc`).
- Caliber column on ammo tab (requires upstream query change).
