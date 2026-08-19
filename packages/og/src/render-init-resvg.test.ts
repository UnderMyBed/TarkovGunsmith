import { describe, expect, it, vi } from "vitest";

// `initResvg` — the explicit init entrypoint Cloudflare Pages Functions call with a
// bundler-supplied wasm module/buffer — shares render.ts's module-scoped `resvgReady`
// promise with the Node auto-init path (`ensureResvgReadyNode`, exercised by
// render.test.ts's real `renderPng` calls). `@resvg/resvg-wasm`'s real `initWasm` is a
// genuine process-wide singleton ("Already initialized. The initWasm() function can be
// used only once." — confirmed experimentally: neither a separate test file's default
// module isolation nor `vi.resetModules()` resets it, since that state lives inside the
// wasm-bindgen glue, not anywhere vitest's module graph controls). Since render.test.ts
// needs to be the one real cold init — every render in this package's suite depends on
// that auto-init path actually having run — this file mocks `@resvg/resvg-wasm` so
// `initResvg`'s own guard-and-memoize logic can be driven through both branches (cold
// init body vs. already-in-flight early return) without contending for the one real
// init `render.test.ts` performs.
vi.mock("@resvg/resvg-wasm", () => ({
  initWasm: vi.fn().mockResolvedValue(undefined),
}));

describe("initResvg", () => {
  it("initializes once and never re-invokes initWasm on a second call", async () => {
    const { initResvg } = await import("./render.js");
    const { initWasm } = await import("@resvg/resvg-wasm");

    const wasmBytes = new Uint8Array([0]).buffer;
    const first = initResvg(wasmBytes);
    const second = initResvg(wasmBytes);

    // NOTE on what "idempotent" actually means here: `initResvg` is itself declared
    // `async`, so every call returns a *new* wrapper promise (an async function never
    // returns the literal object a `return <promise>` inside it names — it chains onto
    // it) — `first`/`second` are never `Object.is`-equal even though both track the
    // same module-scoped `resvgReady`. The real, observable idempotency contract this
    // asserts instead: both calls resolve, and the second one never re-runs `initWasm`
    // (each of which really would throw "Already initialized" against the real
    // package — see render.test.ts's comment on why that's mocked out here).
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(initWasm).toHaveBeenCalledTimes(1);
    expect(initWasm).toHaveBeenCalledWith(wasmBytes);
  });
});
