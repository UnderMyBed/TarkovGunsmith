// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "@tarkov/data";
import { dropViewerProfiles, keepViewerProfiles, peekViewerProfiles } from "./viewer-profiles.js";

afterEach(() => sessionStorage.clear());

describe("viewer profiles kept across a save", () => {
  it("are read back for the pair they were kept for, and only that pair", () => {
    keepViewerProfiles("abcd2345", { leftProfile: DEFAULT_PROFILE });
    expect(peekViewerProfiles("abcd2345")).toEqual({
      leftProfile: DEFAULT_PROFILE,
      rightProfile: undefined,
    });
    expect(peekViewerProfiles("efgh2345")).toBeNull();
    dropViewerProfiles();
    expect(peekViewerProfiles("abcd2345")).toBeNull();
  });

  it("keep nothing when there is no profile, dropping any held", () => {
    keepViewerProfiles("abcd2345", { leftProfile: DEFAULT_PROFILE });
    keepViewerProfiles("efgh2345", {});
    expect(sessionStorage.getItem("compare:viewerProfiles")).toBeNull();
  });

  it("are no carry-over when the stored value does not parse", () => {
    sessionStorage.setItem("compare:viewerProfiles", "{not json");
    expect(peekViewerProfiles("abcd2345")).toBeNull();
    sessionStorage.setItem(
      "compare:viewerProfiles",
      JSON.stringify({ pairId: "abcd2345", leftProfile: { mode: "basic" } }),
    );
    expect(peekViewerProfiles("abcd2345")).toBeNull();
  });
});
