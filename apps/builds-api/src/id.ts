import { customAlphabet } from "nanoid";

// Lowercase alphanumeric, with 0/O/I/l/1 removed to avoid ambiguity in URLs.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const ID_LENGTH = 8;

const generate = customAlphabet(ALPHABET, ID_LENGTH);

/**
 * Generate a fresh 8-character build id from the safe alphabet.
 *
 * @example
 *   newBuildId(); // "k7m4n8p2"
 */
export function newBuildId(): string {
  return generate();
}

/**
 * Regex matching valid build ids — exactly 8 chars from the safe alphabet.
 * Use to validate path parameters before any KV lookup.
 */
export const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;
