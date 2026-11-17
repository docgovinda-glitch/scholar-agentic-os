/**
 * Sign-in identifier rules shared by the browser (src/services/supabaseAuthService.ts)
 * and the server (server/routes/auth.ts). One definition, so the two sides can
 * never disagree about what a valid User ID, email or mobile number looks like.
 *
 * Pure: no React, no I/O.
 */

export type IdentifierType = "email" | "username" | "phone" | "unknown";

/** E.164: "+" then a 1-3 digit country code and 6-14 further digits. */
const E164_PHONE = /^\+\d{1,3}\d{6,14}$/;
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-zA-Z0-9_-]+$/;

/**
 * Decides what a sign-in identifier is. Order matters: a phone number never
 * matches the email or username patterns, and an email always contains "@",
 * which a username never may.
 */
export function detectIdentifierType(rawIdentifier: string): IdentifierType {
  const identifier = rawIdentifier.trim();
  if (!identifier) return "unknown";
  if (E164_PHONE.test(identifier)) return "phone";
  if (EMAIL_ADDRESS.test(identifier)) return "email";
  if (USERNAME.test(identifier)) return "username";
  return "unknown";
}

export const INVALID_IDENTIFIER_MESSAGE = "Invalid User ID, email, or mobile number format.";

/**
 * The one sign-in failure message. Identical for an unknown identifier and a
 * wrong password, so the response never reveals which accounts exist.
 */
export const UNIFORM_LOGIN_ERROR =
  "Invalid credentials. Please check your User ID, email, or mobile number and try again.";
