# @tarkov/ballistics

Pure-TS ballistic and armor math for the TarkovGunsmith rebuild.

## Install

Workspace-internal — consumed via pnpm workspace protocol:

```jsonc
// in another workspace package
{
  "dependencies": {
    "@tarkov/ballistics": "workspace:*",
  },
}
```

## Use

```ts
import { simulateShot, type BallisticAmmo, type BallisticArmor } from "@tarkov/ballistics";

const ammo: BallisticAmmo = {
  /* ... */
};
const armor: BallisticArmor = {
  /* ... */
};

const result = simulateShot(ammo, armor, /* distance */ 15);
console.log(result.didPenetrate, result.damage);
```

## Develop

```bash
pnpm --filter @tarkov/ballistics test
pnpm --filter @tarkov/ballistics test:watch
pnpm --filter @tarkov/ballistics test:coverage
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
