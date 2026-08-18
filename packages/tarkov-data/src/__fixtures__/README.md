# Upstream fixtures

Trimmed captures of `json.tarkov.dev/regular/{items,tasks,traders}` and their `_en` siblings,
taken 2026-08-18. Each `*-sample.json` is `{ document, lang }` — `document` is the raw upstream
envelope (`{ data, translations }`), `lang` is the subset of the `_en` map those records need.

They exist so the suite does not depend on upstream being reachable. The GraphQL API this project
used to call went down for over a month; tests that need a live API stop being tests the moment
that happens.

`items-sample.json` deliberately includes item types the selectors must _reject_ as well as ones
they must accept — a grenade, a helmet, a magazine and a scope alongside ammo, armor, weapons and
weapon mods — so a selector that is too permissive fails rather than passing quietly.

**Refresh** with the capture script in Task 5 of
`docs/plans/2026-08-18-json-api-migration-plan.md` when upstream shapes change.
