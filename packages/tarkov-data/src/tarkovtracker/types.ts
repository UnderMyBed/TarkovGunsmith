import { z } from "zod";

const taskProgress = z.object({
  id: z.string().min(1),
  complete: z.boolean(),
  invalid: z.boolean().optional(),
  failed: z.boolean().optional(),
});

const hideoutProgress = z.object({
  id: z.string().min(1),
  complete: z.boolean(),
});

/**
 * Response from `GET https://tarkovtracker.io/api/v2/progress`. See spec §3 or
 * the `formatProgress()` source in TarkovTracker/functions/api/v2/index.js.
 */
export const RawProgressionSchema = z.object({
  tasksProgress: z.array(taskProgress),
  taskObjectivesProgress: z.array(taskProgress),
  hideoutModulesProgress: z.array(hideoutProgress),
  hideoutPartsProgress: z.array(hideoutProgress),
  displayName: z.string(),
  userId: z.string(),
  playerLevel: z.number().int().nonnegative(),
  gameEdition: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  pmcFaction: z.union([z.literal("USEC"), z.literal("BEAR")]),
});

export type RawProgression = z.infer<typeof RawProgressionSchema>;

export interface MapResult {
  profile: {
    completedQuests: string[];
    flea: boolean;
  };
  meta: {
    questCount: number;
    playerLevel: number;
    unmappedCount: number;
  };
}
