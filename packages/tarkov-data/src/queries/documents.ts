/**
 * Shapes of the upstream json.tarkov.dev documents after translation merge.
 *
 * Both are keyed by id rather than being arrays, which is the main structural difference
 * from the GraphQL API these selectors replaced.
 */

/** One entry in the upstream armor-material lookup, keyed by material id. */
export interface ArmorMaterialEntry {
  id: string;
  name: string;
  destructibility: number;
}

/** The upstream items document. One map holding every item type, plus lookup tables. */
export interface ItemsDocument {
  items: Record<string, unknown>;
  /**
   * Material id -> material. Armor items carry `properties.material` as a bare id
   * where the GraphQL API embedded the resolved object, so armor selection joins here.
   */
  armorMaterials?: Record<string, ArmorMaterialEntry>;
}

/** The upstream tasks document. */
export interface TasksDocument {
  tasks: Record<string, unknown>;
}
