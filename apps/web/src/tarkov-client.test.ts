import { afterEach, describe, expect, it, vi } from "vitest";
import {
  builderData,
  BUILDER_SNAPSHOT_URL,
  localFetchedAtStore,
  tarkovClient,
  TARKOV_JSON_API_BASE,
} from "./tarkov-client.js";

describe("tarkovClient", () => {
  it("is configured for the json.tarkov.dev regular game mode", () => {
    expect(TARKOV_JSON_API_BASE).toBe("https://json.tarkov.dev/regular/");
  });

  it("exposes a fetchResource function", () => {
    expect(typeof tarkovClient.fetchResource).toBe("function");
  });
});

describe("builderData", () => {
  it("reads the snapshot from the site and prices from upstream", () => {
    expect(BUILDER_SNAPSHOT_URL).toBe("/data/builder-snapshot.json");
    expect(typeof builderData.snapshot).toBe("function");
    expect(typeof builderData.prices).toBe("function");
  });
});

describe("localFetchedAtStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  function storage(fail: boolean) {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => {
        if (fail) throw new DOMException("blocked", "SecurityError");
        return data.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (fail) throw new DOMException("blocked", "SecurityError");
        data.set(key, value);
      },
    };
  }

  it("keeps the last fetch time across stores, as across page loads", () => {
    vi.stubGlobal("localStorage", storage(false));
    expect(localFetchedAtStore().get()).toBeNull();
    localFetchedAtStore().set(1_792_198_082_000);
    expect(localFetchedAtStore().get()).toBe(1_792_198_082_000);
  });

  it("lasts as long as the page where storage is refused", () => {
    vi.stubGlobal("localStorage", storage(true));
    const store = localFetchedAtStore();
    expect(store.get()).toBeNull();
    store.set(1_792_198_082_000);
    expect(store.get()).toBe(1_792_198_082_000);
  });
});
