import {
  affiliationProblem,
  educationLevelProblem,
  emailProblem,
  fullNameProblem,
  idDocumentProblem,
  institutionalIdProblem,
  userTypeProblem,
  usernameProblem,
} from "../../config/accountSchema";
import { DEFAULT_COUNTRY_ISO2, e164Problem, findCountry } from "../../config/countries";

/**
 * The states Desk's unauthenticated surface can be in.
 *
 * Kept as data rather than scattered booleans because these are genuinely
 * exclusive — a user is on exactly one of them — and because one is reached
 * by an event rather than by clicking: "recover" is entered when Supabase parses
 * a recovery link out of the URL.
 */
export type AuthScreen =
  | "sign-in"
  | "sign-up"
  /** Requesting a reset email. */
  | "forgot"
  /** Setting a new password inside a recovery session. */
  | "recover"
  /** Registration submitted; email verification is on its way. */
  | "registered";

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
 * canonical account schema, minus the system-controlled ones (verification
 * status, subscription plan, account status) that do not exist yet at
 * registration. The institutional ID document itself is not a string field
 * (it is a File, held separately in SignUpScreen's own state) — see
 * accountSchema.ts's header comment for why.
 */
export interface SignUpFields {
  username: string;
  fullName: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  affiliation: string;
  authenticId: string;
  userType: string;
  educationLevel: string;
  password: string;
}

/**
 * Plain single-input fields, rendered with AuthLayout's <Field>. Phone (a
 * composite country-code + number control), User Type / Level of Education
 * (dropdowns), and the ID document (a file input) are NOT here — they need
 * their own components (PhoneField/SelectField/FileField) and are rendered
 * directly in SignUpScreen.
 */
export const SIGN_UP_FIELDS: ReadonlyArray<{
  key: keyof Pick<SignUpFields, "fullName" | "username" | "email" | "affiliation" | "authenticId" | "password">;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
}> = [
  { key: "fullName", label: "Full name", type: "text", autoComplete: "name" },
  {
    key: "username",
    label: "Username",
    type: "text",
    autoComplete: "username",
    hint: "You will sign in with this, not your email.",
  },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  {
    key: "affiliation",
    label: "Institution",
    type: "text",
    autoComplete: "organization",
    hint: "University, department, or organisation.",
  },
  {
    key: "authenticId",
    label: "Institutional ID",
    type: "text",
    autoComplete: "off",
    hint: "Student or staff number.",
  },
  { key: "password", label: "Password", type: "password", autoComplete: "new-password" },
];

export const EMPTY_SIGN_UP: SignUpFields = {
  username: "",
  fullName: "",
  email: "",
  phoneCountryCode: findCountry(DEFAULT_COUNTRY_ISO2)?.dialCode ?? "+977",
  phone: "",
  affiliation: "",
  authenticId: "",
  userType: "",
  educationLevel: "",
  password: "",
};

/**
 * Every field required, using the exact same validators Account Settings
 * uses for the fields the two screens share (accountSchema.ts,
 * countries.ts) — this is what keeps "what makes a submission valid" from
 * drifting between the two screens. `document` is checked here too
 * (idDocumentProblem) even though it isn't part of SignUpFields, since
 * Create Account must stay disabled without it.
 */
export function signUpProblem(fields: SignUpFields, document: File | null): string | null {
  return (
    fullNameProblem(fields.fullName) ||
    usernameProblem(fields.username) ||
    emailProblem(fields.email) ||
    e164Problem(fields.phoneCountryCode, fields.phone) ||
    affiliationProblem(fields.affiliation) ||
    institutionalIdProblem(fields.authenticId) ||
    userTypeProblem(fields.userType) ||
    educationLevelProblem(fields.educationLevel) ||
    passwordProblem(fields.password) ||
    idDocumentProblem(document)
  );
}
