import { z } from "zod";
import { Build, toBuildPayload } from "@tarkov/data";

/** The in-progress build at `/builder`. */
export const DRAFT_KEY = "tg:builder-draft";

const SHARED_DRAFT_PREFIX = `${DRAFT_KEY}:`;

/** The edits made to the shared build `id` at `/builder/$id`. Never the `/builder` draft. */
export function sharedDraftKey(id: string): string {
  return `${SHARED_DRAFT_PREFIX}${id}`;
}

/** How many shared builds keep their edits; writing one more evicts the least recently written. */
export const SHARED_DRAFTS_KEPT = 5;

/** A stored value longer than this is not read. A real draft is a few kilobytes. */
export const DRAFT_MAX_CHARS = 64 * 1024;

/**
 * The bound on a draft's orphans. A shared build carries at most `ORPHANED_CAP`; a draft is
 * the editor's state, which never caps them, so a draft holds more rather than drop any.
 */
export const DRAFT_ORPHANED_MAX = 256;

/** The bound on a draft's attachments: well above any weapon's slot count. */
export const DRAFT_ATTACHMENTS_MAX = 256;

/**
 * The stored envelope. `draft` versions the envelope; the build inside carries its own
 * `version` and goes through `loadSavedBuild` like any saved build, so a draft written by an
 * older release loads the way an old share link does. Its orphans are checked here, without
 * the share cap, and the rest of it by `Build`.
 */
const DraftEnvelope = z.object({
  draft: z.literal(1),
  writtenAt: z.number(),
  build: z
    .object({
      orphaned: z.array(z.string().min(1)).max(DRAFT_ORPHANED_MAX),
      attachments: z
        .record(z.string(), z.string())
        .refine((a) => Object.keys(a).length <= DRAFT_ATTACHMENTS_MAX, "too many attachments"),
    })
    .passthrough(),
});

/** What a draft records: the build alone. No profile, no mode. */
export interface DraftBuild {
  readonly weaponId: string;
  readonly attachments: Readonly<Record<string, string>>;
  readonly orphaned: readonly string[];
  readonly name: string;
  readonly description: string;
}

/** A draft without a weapon is not kept: there is no build yet. */
export function isEmptyDraft(d: DraftBuild): boolean {
  return d.weaponId === "";
}

/**
 * Parse a stored draft. `null` when there is none. Anything unreadable (not JSON, another
 * shape, too long) is also `null`, with one warning naming the key and why: the Builder then
 * starts empty, and the stored value stays until the next edit replaces it.
 */
export function parseDraft(key: string, raw: string | null): Build | null {
  if (raw === null) return null;
  const reject = (why: string): null => {
    console.warn(`Ignoring the saved draft in ${key}: ${why}`);
    return null;
  };
  if (raw.length > DRAFT_MAX_CHARS) return reject(`it is over ${DRAFT_MAX_CHARS} characters`);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reject("it is not JSON");
  }
  const envelope = DraftEnvelope.safeParse(json);
  if (!envelope.success) return reject(envelope.error.issues[0]?.message ?? "unknown shape");
  const { orphaned, ...rest } = envelope.data.build;
  const build = Build.safeParse({ ...rest, orphaned: [] });
  if (!build.success) return reject(build.error.issues[0]?.message ?? "unknown build shape");
  if (build.data.version === 1) return reject("it is a v1 build");
  return { ...build.data, orphaned };
}

/** Read the draft at `key`. Storage that cannot be read counts as no draft, with a warning. */
export function readDraft(key: string): Build | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (err) {
    console.warn(`Could not read the saved draft in ${key}:`, err);
    return null;
  }
  return parseDraft(key, raw);
}

/** The stored form of `d`: the same payload a share sends, through `toBuildPayload`. */
export function serializeDraft(d: DraftBuild, writtenAt: number): string {
  const build = toBuildPayload(
    { weaponId: d.weaponId, attachments: { ...d.attachments }, orphaned: [...d.orphaned] },
    { name: d.name, description: d.description, createdAt: new Date(writtenAt).toISOString() },
  );
  return JSON.stringify({ draft: 1, writtenAt, build });
}

/**
 * Store `d` at `key`, or remove the key when `d` is empty. A shared build's draft evicts the
 * least recently written ones beyond {@link SHARED_DRAFTS_KEPT}. A storage error (quota,
 * disabled) is warned about and otherwise ignored: the build stays on screen, unsaved.
 */
export function writeDraft(key: string, d: DraftBuild, now: number = Date.now()): void {
  try {
    if (isEmptyDraft(d)) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, serializeDraft(d, now));
    if (key.startsWith(SHARED_DRAFT_PREFIX)) evictSharedDrafts();
  } catch (err) {
    console.warn(`Could not save the draft to ${key}:`, err);
  }
}

/** Whether a value is stored at `key`, readable or not. Storage that throws holds none. */
export function hasDraft(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Remove the draft at `key`. */
export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn(`Could not remove the draft in ${key}:`, err);
  }
}

/** Keep the {@link SHARED_DRAFTS_KEPT} most recently written shared drafts; unreadable ones go first. */
function evictSharedDrafts(): void {
  const storage = window.localStorage;
  const drafts: { key: string; writtenAt: number }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null || !key.startsWith(SHARED_DRAFT_PREFIX)) continue;
    drafts.push({ key, writtenAt: writtenAtOf(storage.getItem(key)) });
  }
  drafts.sort((a, b) => b.writtenAt - a.writtenAt);
  for (const { key } of drafts.slice(SHARED_DRAFTS_KEPT)) storage.removeItem(key);
}

function writtenAtOf(raw: string | null): number {
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    const at = (parsed as { writtenAt?: unknown } | null)?.writtenAt;
    return typeof at === "number" ? at : Number.NEGATIVE_INFINITY;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}
