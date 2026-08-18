/**
 * Shapes of the upstream json.tarkov.dev documents after translation merge.
 *
 * Both are keyed by id rather than being arrays, which is the main structural difference
 * from the GraphQL API these selectors replaced.
 */

/** The upstream items document. One map holding every item type. */
export interface ItemsDocument {
  items: Record<string, unknown>;
}

/** The upstream tasks document. */
export interface TasksDocument {
  tasks: Record<string, unknown>;
}
