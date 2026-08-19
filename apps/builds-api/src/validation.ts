/**
 * Renders a Zod validation failure as a compact, useful 400 body, e.g.
 *   "weaponId: Required; attachments.mod_scope: Expected string, received number"
 *
 * Field path segments come from the schema's own shape, plus (for the `attachments` record
 * and `modIds`/`completedQuests` arrays) the payload's own keys/indices — never from anything
 * else the client controls — so it's safe to echo back verbatim.
 *
 * Typed structurally rather than as `ZodError`. `ZodError<T>` is invariant in T, so a
 * concrete `ZodError<Build>` is assignable to neither `ZodError<any>` nor `ZodError<unknown>`
 * under zod 4 — and this function only ever reads `.issues`. Depending on the shape it uses
 * instead of the nominal type keeps it working across zod majors, which matters here because
 * the zod 3 -> 4 upgrade is what surfaced this in the first place.
 */
export interface ValidationIssues {
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[];
}

export function formatValidationError(error: ValidationIssues): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
