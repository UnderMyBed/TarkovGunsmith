// Ambient module declarations for non-TS assets imported by Pages Functions.
//
// Wrangler / the CF Pages bundler resolves these imports at build time:
//  - `.wasm` → a `WebAssembly.Module` binding (passed to `initResvg`).
//  - `.png`  → a raw `ArrayBuffer` (the pre-rendered fallback card).
//
// TypeScript doesn't know about either by default; these declarations make
// the imports type-check without having to cast at the call site.

declare module "*.wasm" {
  const content: WebAssembly.Module;
  export default content;
}

declare module "*.png" {
  const content: ArrayBuffer;
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
