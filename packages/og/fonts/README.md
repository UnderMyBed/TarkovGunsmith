# Fonts

Font files for the Open Graph card renderer. Satori needs `ArrayBuffer`s at
render time; fetching at runtime inside a Cloudflare Worker is unreliable, so
these files are bundled alongside the Pages Function.

Must stay in sync with the Google Fonts `<link>` in
`apps/web/index.html`. If that link changes, re-run the download below and
regenerate `assets/fallback-card.png`.

| File                 | Family      | Weight | Source               |
| -------------------- | ----------- | -----: | -------------------- |
| `Bungee-Regular.ttf` | Bungee      |    400 | Google Fonts CSS API |
| `Chivo-700.ttf`      | Chivo       |    700 | Google Fonts CSS API |
| `AzeretMono-500.ttf` | Azeret Mono |    500 | Google Fonts CSS API |
| `AzeretMono-700.ttf` | Azeret Mono |    700 | Google Fonts CSS API |

Downloaded: 2026-04-21. Licensed under the SIL Open Font License 1.1.

## Regeneration

Resolve the current `.ttf` URLs from Google Fonts (the CSS varies by version):

```bash
curl -sS -A "Mozilla/5.0" \
  "https://fonts.googleapis.com/css2?family=Bungee&family=Chivo:wght@700&family=Azeret+Mono:wght@500;700&display=swap" \
  | grep -oE "https://[^)]+\\.ttf"
```

Then `curl -sSL -o <local>.ttf "<url>"` each one.

See `scripts/build-fallback-png.ts` — the fallback PNG is re-rendered from
these font files plus the card JSX whenever the design changes.
