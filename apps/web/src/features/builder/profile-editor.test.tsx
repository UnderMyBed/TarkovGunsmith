// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useCompletedQuestSet, useTaskList } from "./profile-editor.js";
import type { TaskListItem } from "@tarkov/data";

afterEach(() => cleanup());

describe("useCompletedQuestSet", () => {
  it("returns the same Set instance across a re-render when completedQuests is unchanged", () => {
    // Regression test for a real bug: profile-editor.tsx used to build
    // `new Set(profile.completedQuests ?? [])` directly in the component body, with no
    // useMemo. Every render produced a brand new Set, so any useMemo that listed it as a
    // dependency recomputed every time — the memoisation was silently doing nothing.
    const completedQuests = ["quest-a", "quest-b"];
    const { result, rerender } = renderHook(
      ({ quests }: { quests: readonly string[] | undefined }) => useCompletedQuestSet(quests),
      { initialProps: { quests: completedQuests } },
    );
    const first = result.current;
    rerender({ quests: completedQuests }); // same array reference, nothing changed
    expect(result.current).toBe(first);
  });

  it("returns a new Set instance when completedQuests changes", () => {
    const { result, rerender } = renderHook(
      ({ quests }: { quests: readonly string[] | undefined }) => useCompletedQuestSet(quests),
      { initialProps: { quests: ["quest-a"] as readonly string[] | undefined } },
    );
    const first = result.current;
    rerender({ quests: ["quest-a", "quest-b"] });
    expect(result.current).not.toBe(first);
    expect(result.current.has("quest-b")).toBe(true);
  });

  it("treats undefined as an empty set", () => {
    const { result } = renderHook(() => useCompletedQuestSet(undefined));
    expect(result.current.size).toBe(0);
  });
});

describe("useTaskList", () => {
  const tasks: TaskListItem[] = [{ normalizedName: "task-a", name: "Task A" } as TaskListItem];

  it("returns the same array instance across a re-render when data is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: readonly TaskListItem[] | undefined }) => useTaskList(data),
      { initialProps: { data: tasks } },
    );
    const first = result.current;
    rerender({ data: tasks });
    expect(result.current).toBe(first);
  });

  it("returns a stable empty array across renders when data is undefined", () => {
    // Before the fix, `data ?? []` allocated a brand new array on every render whenever
    // `data` was undefined (e.g. while the query is still loading) — defeating any memo
    // keyed on it for the entire loading window.
    const { result, rerender } = renderHook(
      ({ data }: { data: readonly TaskListItem[] | undefined }) => useTaskList(data),
      { initialProps: { data: undefined as readonly TaskListItem[] | undefined } },
    );
    const first = result.current;
    rerender({ data: undefined });
    expect(result.current).toBe(first);
  });
});
