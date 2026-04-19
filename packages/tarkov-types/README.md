# @tarkov/types

Generated TypeScript types for the api.tarkov.dev GraphQL schema.

## Use

```ts
import type { Item, Weapon, Ammo } from "@tarkov/types";

function pickBestAmmo(ammo: readonly Ammo[]): Ammo | undefined {
  return ammo.find((a) => a.penetrationPower > 50);
}
```

## Refresh schema

```bash
pnpm --filter @tarkov/types codegen:refresh
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
