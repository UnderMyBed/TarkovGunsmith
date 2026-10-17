import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react";
import { useTasks } from "@tarkov/data";

/** A quest's display name by its `normalizedName`, or `undefined` when it is not known. */
export type QuestName = (normalizedName: string) => string | undefined;

const unknown: QuestName = () => undefined;

const QuestNameContext = createContext<QuestName>(unknown);

/**
 * Supplies quest display names to the availability labels below it, from the snapshot's task
 * list. Every quest an offer names is in that list, so a name is missing only while it loads.
 */
export function QuestNameProvider({ children }: { children: ReactNode }): ReactElement {
  const tasks = useTasks();
  const questName = useMemo<QuestName>(() => {
    const names = new Map((tasks.data ?? []).map((t) => [t.normalizedName, t.name]));
    return (normalizedName) => names.get(normalizedName);
  }, [tasks.data]);
  return <QuestNameContext.Provider value={questName}>{children}</QuestNameContext.Provider>;
}

/** The nearest {@link QuestNameProvider}'s lookup; outside one, every name is unknown. */
export function useQuestName(): QuestName {
  return useContext(QuestNameContext);
}
