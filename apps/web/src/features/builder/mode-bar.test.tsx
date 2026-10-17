// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FLEA_UNLOCK_LEVEL, useProgression, type PlayerProfile } from "@tarkov/data";
import { ModeBar } from "./mode-bar.js";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function stubSync(connect = vi.fn(() => Promise.resolve())): UseTarkovTrackerSyncResult {
  return {
    state: "disconnected",
    detail: { state: "disconnected" },
    connect,
    reSync: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
  };
}

/** The profile the harness last rendered with. */
function latestProfile(): PlayerProfile {
  return JSON.parse(screen.getByTestId("profile").textContent ?? "") as PlayerProfile;
}

/** The bar over the real `useProgression`, so what it sets is what persists. */
function Harness({ sync }: { sync: UseTarkovTrackerSyncResult }) {
  const progression = useProgression();
  return (
    <>
      <span data-testid="mode">{progression.mode}</span>
      <span data-testid="profile">{JSON.stringify(progression.profile)}</span>
      <ModeBar progression={progression} sync={sync} />
    </>
  );
}

const pressed = (name: string) => screen.getByRole("button", { name, pressed: true });

describe("ModeBar", () => {
  it("prompts a first visit, in theorycraft, to set a progression", () => {
    render(<Harness sync={stubSync()} />);
    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.getByText("Set your progression")).toBeInTheDocument();
    expect(pressed("Theorycraft")).toBeInTheDocument();
    for (const ll of ["LL1", "LL2", "LL3", "LL4"]) {
      expect(screen.getByRole("button", { name: ll })).toBeInTheDocument();
    }
  });

  it("sets an LL2 profile in one click and switches to progression", () => {
    render(<Harness sync={stubSync()} />);
    fireEvent.click(screen.getByRole("button", { name: "LL2" }));

    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
    expect(screen.queryByText("Set your progression")).not.toBeInTheDocument();
    expect(pressed("Progression")).toBeInTheDocument();
    expect(latestProfile().traders.peacekeeper).toBe(2);
    expect(latestProfile()).toMatchObject({ flea: true, level: FLEA_UNLOCK_LEVEL });
    expect(window.localStorage.getItem("tg:builder-mode")).toBe("progression");
  });

  it("toggles back to theorycraft, keeping the profile", () => {
    render(<Harness sync={stubSync()} />);
    fireEvent.click(screen.getByRole("button", { name: "LL3" }));
    fireEvent.click(screen.getByRole("button", { name: "Theorycraft" }));

    expect(screen.getByTestId("mode")).toHaveTextContent("theorycraft");
    expect(screen.getByText("Set your progression")).toBeInTheDocument();
    expect(latestProfile().traders.jaeger).toBe(3);
    expect(window.localStorage.getItem("tg:builder-mode")).toBe("theorycraft");
  });

  it("imports from TarkovTracker in advanced mode, which reads the quests it brings", () => {
    const connect = vi.fn(() => Promise.resolve());
    render(<Harness sync={stubSync(connect)} />);
    fireEvent.click(screen.getByRole("button", { name: /Import from TarkovTracker/ }));
    fireEvent.change(screen.getByPlaceholderText(/token/i), { target: { value: "tok-123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Connect/ }));

    expect(connect).toHaveBeenCalledWith("tok-123");
    expect(latestProfile().mode).toBe("advanced");
    expect(screen.getByTestId("mode")).toHaveTextContent("progression");
  });
});
