import type { ZodError } from "zod";

/**
 * Renders a Zod validation failure as a compact, useful 400 body, e.g.
 *   "weaponId: Required; attachments.mod_scope: Expected string, received number"
 *
 * Field path segments come from the schema's own shape, plus (for the `attachments` record
 * and `modIds`/`completedQuests` arrays) the payload's own keys/indices — never from anything
 * else the client controls — so it's safe to echo back verbatim.
 */
export function formatValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
