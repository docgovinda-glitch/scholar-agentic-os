/**
 * The states Desk's unauthenticated surface can be in.
 *
 * Kept as data rather than scattered booleans because these are genuinely
 * exclusive — a user is on exactly one of them — and because two are reached
 * by events rather than by clicking: "recover" is entered when Supabase parses
 * a recovery link out of the URL, and "awaiting-approval" when a sign-in
 * succeeds against Auth but the profile has not been approved yet.
 */
export type AuthScreen =
  | "sign-in"
  | "sign-up"
  /** Requesting a reset email. */
  | "forgot"
  /** Setting a new password inside a recovery session. */
  | "recover"
  /** Registered, admin approval outstanding — a dead end until an admin acts. */
  | "awaiting-approval"
  /** Registration submitted; the confirmation/approval mail is on its way. */
  | "registered";

/**
 * Password rule, applied at the form so the failure is immediate rather than a
 * round trip. Supabase enforces its own minimum server-side; this must not be
 * weaker than that, and 8 is Supabase's default.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Sign-up asks for seven fields because `signUp()` writes all of them into the
 * profile an administrator reviews before approving the account. An empty
 * affiliation or a missing institutional ID leaves them approving a stranger,
 * so these are required here rather than nullable in the database.
 */
export interface SignUpFields {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  affiliation: string;
  authenticId: string;
  password: string;
}

export const SIGN_UP_FIELDS: ReadonlyArray<{
  key: keyof SignUpFields;
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
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
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
    hint: "Student or staff number — an administrator checks this before approving you.",
  },
  { key: "password", label: "Password", type: "password", autoComplete: "new-password" },
];

export const EMPTY_SIGN_UP: SignUpFields = {
  username: "",
  fullName: "",
  email: "",
  phone: "",
  affiliation: "",
  authenticId: "",
  password: "",
};

/** Every field is required, so "can submit" is simply "nothing left blank, password long enough". */
export function signUpProblem(fields: SignUpFields): string | null {
  for (const { key, label } of SIGN_UP_FIELDS) {
    if (fields[key].trim() === "") return `${label} is required.`;
  }
  return passwordProblem(fields.password);
}
