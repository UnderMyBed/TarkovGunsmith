// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { startObservability } from "./start.js";
import { connectTracking, resetTrackingForTests, track } from "./track.js";

afterEach(() => {
  resetTrackingForTests();
  vi.restoreAllMocks();
});

const URL = "https://faro-collector-prod-us-west-0.grafana.net/collect/abc123";

describe("startObservability", () => {
  it("never loads Faro off the production origins, and drops queued events", () => {
    const load = vi.fn();
    track("compare_opened");
    startObservability("http://localhost:4173", URL, load);
    expect(load).not.toHaveBeenCalled();
    const sink = vi.fn();
    connectTracking(sink);
    expect(sink).not.toHaveBeenCalled();
  });

  it("never loads Faro when the build carries no URL", () => {
    const load = vi.fn();
    startObservability("https://tarkovgunsmith.undermybed.dev", undefined, load);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads Faro on a production origin once the page has loaded", async () => {
    const startFaro = vi.fn();
    const load = vi.fn(() => Promise.resolve({ startFaro }));
    startObservability("https://tarkovgunsmith.undermybed.dev", URL, load);
    // jsdom's document is complete by the time tests run.
    await vi.waitFor(() => expect(startFaro).toHaveBeenCalledWith(URL));
  });

  it("says so, and keeps nothing, when the Faro chunk fails to load", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn(() => Promise.reject(new Error("chunk failed")));
    startObservability("https://tarkov-gunsmith-web.pages.dev", URL, load);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith("Faro failed to start", expect.any(Error)),
    );
    track("build_shared");
    const sink = vi.fn();
    connectTracking(sink);
    expect(sink).not.toHaveBeenCalled();
  });
});
