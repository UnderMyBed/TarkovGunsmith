import { BuildPair, type BuildPair as BuildPairType } from "./pair-schema.js";
import { upgradeLoadedBuild } from "./build-migrations.js";

const PAIRS_ENDPOINT = "/api/pairs";

// Same alphabet + length as apps/builds-api/src/id.ts. Kept in sync manually —
// if the Worker's id format changes, update here too (and add a regression
// test in pairsApi.test.ts).
const PAIR_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

export type LoadPairErrorCode = "invalid-id" | "not-found" | "unreachable" | "invalid-schema";

export class LoadPairError extends Error {
  constructor(
    public readonly code: LoadPairErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LoadPairError";
  }
}

/**
 * A write to the pair store that came back non-201, carrying the status so the UI can pick
 * curated copy (rate-limited vs. too large vs. rejected) instead of scraping a message
 * string. `status` is null when the request never reached the Worker — the fetch itself
 * threw, or the body wasn't the `{ id, url }` shape a 201 promises. Mirrors `LoadPairError`
 * in this module; the `message` text is unchanged from the plain `Error` it replaces.
 */
export class SavePairError extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SavePairError";
  }
}

export interface SavePairResponse {
  id: string;
  url: string;
}

function parseSaveResponse(body: unknown): SavePairResponse {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { id?: unknown }).id !== "string" ||
    typeof (body as { url?: unknown }).url !== "string"
  ) {
    throw new SavePairError(null, "pairsApi: malformed response");
  }
  return body as SavePairResponse;
}

/**
 * Persist a build pair by POSTing to the builds-api Worker (via same-origin
 * `/api/pairs`). Throws on any non-201 or malformed response. Callers should
 * surface the failure with a toast — no retry policy here; retries are the
 * caller's call.
 */
export async function savePair(
  fetchImpl: typeof fetch,
  pair: BuildPairType,
): Promise<SavePairResponse> {
  let res: Response;
  try {
    res = await fetchImpl(PAIRS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pair),
    });
  } catch (cause) {
    throw new SavePairError(null, "savePair failed: couldn't reach pair storage", cause);
  }
  if (res.status !== 201) {
    throw new SavePairError(res.status, `savePair failed: HTTP ${res.status}`);
  }
  return parseSaveResponse(await res.json());
}

/**
 * Load a pair by id. Validates the id against the builds-api alphabet before
 * hitting the network, then Zod-parses the response through the `BuildPair`
 * discriminated union. Throws `LoadPairError` with a specific `code` for
 * every failure mode so the UI can pick an error state without re-classifying
 * exceptions.
 */
export async function loadPair(fetchImpl: typeof fetch, id: string): Promise<BuildPairType> {
  if (!PAIR_ID_REGEX.test(id)) {
    throw new LoadPairError("invalid-id", `Pair id "${id}" is malformed`);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${PAIRS_ENDPOINT}/${id}`);
  } catch (cause) {
    throw new LoadPairError("unreachable", "Couldn't reach pair storage", cause);
  }

  if (res.status === 404) {
    throw new LoadPairError("not-found", `Pair "${id}" not found`);
  }
  if (res.status !== 200) {
    throw new LoadPairError("unreachable", `Pair storage returned HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (cause) {
    throw new LoadPairError("invalid-schema", "Pair body was not JSON", cause);
  }

  const parsed = BuildPair.safeParse(raw);
  if (!parsed.success) {
    throw new LoadPairError("invalid-schema", "Pair failed schema validation", parsed.error);
  }

  // Pairs embed whole builds, so they need the same version upgrade `loadBuild` does.
  // Without it an older embedded build reaches `useCompareDraft`, which drops any side
  // that isn't the current version — the build disappears from the comparison with no
  // error shown. That has been live since the v5 bump: every v4 side in a saved pair is
  // already vanishing today.
  const pair = parsed.data;
  return {
    ...pair,
    left: pair.left === null ? null : upgradeLoadedBuild(pair.left),
    right: pair.right === null ? null : upgradeLoadedBuild(pair.right),
  };
}

/**
 * Fork an existing pair — server creates a fresh id pointing at a deep copy,
 * so the caller can safely mutate without affecting the original. Validates
 * the id format before the network call for symmetry with `loadPair`.
 */
export async function forkPair(fetchImpl: typeof fetch, id: string): Promise<SavePairResponse> {
  if (!PAIR_ID_REGEX.test(id)) {
    throw new LoadPairError("invalid-id", `Pair id "${id}" is malformed`);
  }
  let res: Response;
  try {
    res = await fetchImpl(`${PAIRS_ENDPOINT}/${id}/fork`, { method: "POST" });
  } catch (cause) {
    throw new SavePairError(null, "forkPair failed: couldn't reach pair storage", cause);
  }
  if (res.status !== 201) {
    throw new SavePairError(res.status, `forkPair failed: HTTP ${res.status}`);
  }
  return parseSaveResponse(await res.json());
}
