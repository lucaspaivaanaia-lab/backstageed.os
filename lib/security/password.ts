import { randomBytes } from "crypto";

/**
 * Typo-safe alphabet for provisional passwords: excludes visually
 * ambiguous characters (0/O, 1/l/I) since a PM shares this password with a
 * Client over a non-password-manager channel (D-09).
 */
const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * Generates a cryptographically-random provisional password (AUTH-09,
 * D-09) using Node's `crypto.randomBytes` — MUST NOT use JavaScript's
 * built-in pseudo-random number generator
 * (05-RESEARCH.md Security Domain: "generate provisional passwords with
 * sufficient entropy, e.g. a random 12+ char string"). The PM never types
 * this password; it is shown to them ONCE by the calling UI.
 *
 * Default length 16 (>= the 12-char floor) over a 55-character alphabet
 * yields ~92 bits of entropy, comfortably exceeding the 12+ char
 * requirement even accounting for the small modulo bias inherent in
 * mapping bytes onto a non-power-of-two alphabet — acceptable for a
 * one-time provisional password that is immediately rotated on first
 * login (AUTH-10).
 */
export function generateProvisionalPassword(length = 16): string {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return password;
}
