// Ambient module declarations for non-TS assets imported by Pages Functions.
//
// Wrangler / the CF Pages bundler resolves `.wasm` imports to a
// `WebAssembly.Module` binding (passed to `initResvg`).
//
// TypeScript doesn't know about this by default; the declaration makes the
// import type-check without having to cast at the call site.
//
// Note: `.ttf` and `.png` imports are NOT used. The CF Pages bundler in
// wrangler 4.83 does not honor `[[rules]]` for those types, so `@tarkov/og`
// base64-embeds the font + fallback-PNG bytes and exposes them via
// `embeddedFonts()` / `embeddedFallbackPng()` instead.

declare module "*.wasm" {
  const content: WebAssembly.Module;
  export default content;
}

// Cloudflare's Cache API exposes `caches.default` as a per-zone cache handle.
// The DOM lib's `CacheStorage` interface (pulled in via `lib: DOM` for the
// SPA) has no `default` property; augment it here so Pages Functions can
// `caches.default.match(...)` without a cast. `@cloudflare/workers-types`
// declares this too, but the DOM lib wins for the global `caches` binding.
interface CacheStorage {
  readonly default: Cache;
}
