import {
  educationLevelProblem,
  emailProblem,
  fullNameProblem,
  userTypeProblem,
  usernameProblem,
} from "../../config/accountSchema";
import { DEFAULT_COUNTRY_ISO2, e164Problem, findCountry } from "../../config/countries";

/**
 * Password rule, applied at the form so the failure is immediate rather than a
 * round trip. Supabase enforces its own minimum server-side; this must not be
 * weaker than that, and 8 is Supabase's default.
 *
 * Deliberately not in accountSchema.ts: password is the one field that is
 * NEVER shared between Create Account and Account Settings (Account Settings
 * shows New/Confirm New Password, never the existing one) — see
 * AccountSettingsScreen's own header comment.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Sign-up's fields — the same set accountSchema.ts documents as the
 * canonical account schema, minus the system-controlled ones (subscription
 * plan, account status) that do not exist yet at registration. There is no
 * institutional ID or document field here (2026-08-14: removed completely —
 * see accountSchema.ts's header comment for why).
 */
export interface SignUpFields {
  username: string;
  fullName: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  affiliation: string;
  userType: string;
  educationLevel: string;
  password: string;
}

export const EMPTY_SIGN_UP: SignUpFields = {
  username: "",
  fullName: "",
  email: "",
  phoneCountryCode: findCountry(DEFAULT_COUNTRY_ISO2)?.dialCode ?? "+977",
  phone: "",
  affiliation: "",
  userType: "",
  educationLevel: "",
  password: "",
};

/**
 * Every REQUIRED field, using the exact same validators Account Settings
 * uses for the fields the two screens share (accountSchema.ts,
 * countries.ts) — this is what keeps "what makes a submission valid" from
 * drifting between the two screens. Institution is deliberately absent from
 * this chain: it is optional, so there is nothing to validate beyond "is a
 * string," which every text input already guarantees.
 */
export function signUpProblem(fields: SignUpFields): string | null {
  return (
    fullNameProblem(fields.fullName) ||
    usernameProblem(fields.username) ||
    emailProblem(fields.email) ||
    e164Problem(fields.phoneCountryCode, fields.phone) ||
    userTypeProblem(fields.userType) ||
    educationLevelProblem(fields.educationLevel) ||
    passwordProblem(fields.password)
  );
}
