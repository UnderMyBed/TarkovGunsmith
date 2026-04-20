import { Build } from "./build-schema.js";

const BUILDS_ENDPOINT = "/api/builds";

// Same alphabet + length as apps/builds-api/src/id.ts. Kept in sync manually —
// if the Worker's id format changes, update here too (and add a regression
// test in buildsApi.test.ts).
const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

export type LoadBuildErrorCode = "invalid-id" | "not-found" | "unreachable" | "invalid-schema";

export class LoadBuildError extends Error {
  constructor(
    public readonly code: LoadBuildErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LoadBuildError";
  }
}

export interface SaveBuildResponse {
  id: string;
  url: string;
}

/**
 * Persist a build by POSTing to the builds-api Worker (via same-origin
 * `/api/builds`). Throws on any non-201 or malformed response. Callers should
 * surface the failure with a toast — no retry policy here; retries are the
 * caller's call.
 */
export async function saveBuild(fetchImpl: typeof fetch, build: Build): Promise<SaveBuildResponse> {
  const res = await fetchImpl(BUILDS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(build),
  });
  if (res.status !== 201) {
    throw new Error(`saveBuild failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { id?: unknown }).id !== "string" ||
    typeof (body as { url?: unknown }).url !== "string"
  ) {
    throw new Error("saveBuild: malformed response");
  }
  return body as SaveBuildResponse;
}

/**
 * Load a build by id. Validates the id against the builds-api alphabet before
 * hitting the network, then Zod-parses the response through the `Build`
 * discriminated union. Throws `LoadBuildError` with a specific `code` for
 * every failure mode so the UI can pick an error state without re-classifying
 * exceptions.
 */
export async function loadBuild(fetchImpl: typeof fetch, id: string): Promise<Build> {
  if (!BUILD_ID_REGEX.test(id)) {
    throw new LoadBuildError("invalid-id", `Build id "${id}" is malformed`);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${BUILDS_ENDPOINT}/${id}`);
  } catch (cause) {
    throw new LoadBuildError("unreachable", "Couldn't reach build storage", cause);
  }

  if (res.status === 404) {
    throw new LoadBuildError("not-found", `Build "${id}" not found`);
  }
  if (res.status !== 200) {
    throw new LoadBuildError("unreachable", `Build storage returned HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (cause) {
    throw new LoadBuildError("invalid-schema", "Build body was not JSON", cause);
  }

  const parsed = Build.safeParse(raw);
  if (!parsed.success) {
    throw new LoadBuildError("invalid-schema", "Build failed schema validation", parsed.error);
  }
  return parsed.data;
}
