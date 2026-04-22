# Acknowledgments

This project stands on other people's work. Here's who to thank and what to respect.

## Original project

TarkovGunsmith began as [TarkovGunsmith by Xerxes-17](https://github.com/Xerxes-17/TarkovGunsmith). The original repository carries no declared license (GitHub reports `null`). The current project is a ground-up rewrite — no source code, prose, or assets were copied from the original. Thanks to Xerxes-17 for laying the groundwork and proving the community wants a tool like this.

## Game data

Ballistics, weapon, ammo, armor, and trader data comes from [`api.tarkov.dev`](https://api.tarkov.dev), maintained by [`the-hideout`](https://github.com/the-hideout) community. The API is released under the [GPL-3.0 license](https://github.com/the-hideout/tarkov-api/blob/master/LICENSE). No separate terms-of-use document is published; the project describes itself as free, open source, and community-driven, with no documented prohibition on caching or proxy use.

Please respect their infrastructure — if you're running this project locally against live data, the `data-proxy` Worker caches responses at the edge to reduce load. If you want heavy programmatic access, run your own proxy or mirror their dataset.

## Stack

- [React](https://react.dev/) — MIT
- [Vite](https://vitejs.dev/) — MIT
- [TypeScript](https://www.typescriptlang.org/) — Apache-2.0
- [Tailwind CSS](https://tailwindcss.com/) — MIT
- [shadcn/ui](https://ui.shadcn.com/) — MIT
- [TanStack Query](https://tanstack.com/query) — MIT
- [Cloudflare Workers / Pages / KV](https://developers.cloudflare.com/) — hosting

## Fonts

All three fonts are served via the [Google Fonts](https://fonts.google.com/) CDN and are licensed under the SIL Open Font License (OFL).

- **Bungee** — SIL Open Font License, by David Jonathan Ross.
- **Chivo** — SIL Open Font License, by Omnibus-Type.
- **Azeret Mono** — SIL Open Font License, by Displaay Type Foundry.

## Assets

- **Favicon (`favicon.svg`) and Apple Touch Icon (`apple-touch-icon.png`)** — first-party, original artwork in the Field Ledger aesthetic (amber corner brackets on dark ground). No third-party artwork involved.
- **Weapon silhouettes** — not bundled in this repository. Fetched at runtime from `assets.tarkov.dev`, a CDN operated by [the-hideout](https://github.com/the-hideout). These images are EFT game assets processed by [tarkov-dev-image-generator](https://github.com/the-hideout/tarkov-dev-image-generator). Displayed as monochrome decorative backdrops in the Builder UI; attribution for the underlying asset processing goes to the-hideout community.
- **In-app item icons** — also fetched at runtime from `assets.tarkov.dev` (same CDN, same attribution as above). No icons are bundled in this repository.

## Trademark

Escape from Tarkov, the EFT logo, and related marks are trademarks of Battlestate Games Limited. This project is an unofficial, fan-made community tool and is not affiliated with, endorsed by, or sponsored by Battlestate Games.

## Open items

- The original [Xerxes-17/TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) repository carries no declared license. Because the current codebase is a ground-up rewrite with no copied assets, this does not affect the current project's MIT license. Noted here for transparency.
- The `api.tarkov.dev` / `assets.tarkov.dev` projects (the-hideout) do not publish a formal terms-of-use document. Usage is consistent with their stated intent (free, open source, community-driven). If they publish a ToU in the future, update this file accordingly.
- Weapon silhouette and item icon images derive from EFT game assets. Battlestate Games has not issued a formal fan-tool asset policy; current usage (decorative, non-commercial, no redistribution of bundled assets) is in line with standard community tool precedent.
