/**
 * The canonical account/profile schema — Single Source of Truth for
 * registration (AuthFlow.tsx's SignUpScreen) and Account Settings
 * (desk/account/AccountSettingsScreen.tsx).
 *
 * Why this exists: before this file, "what fields does a Scholar account
 * have, and what makes each one valid" was defined once in
 * desk/auth/authScreens.ts for signup only — Account Settings had no
 * equivalent, and any future settings screen would have had to invent its
 * own copy of the same field list, the same "is this a valid phone number"
 * logic, and the same role/education-level options, with no way to notice
 * the two had drifted apart. Every value a user can choose for `userType` or
 * `educationLevel`, and every validator that decides whether a submission is
 * acceptable, is defined exactly once here — both screens import it rather
 * than each declaring "the same" list.
 *
 * What is NOT here, deliberately: password rules stay in
 * desk/auth/authScreens.ts (password is the one intentional difference
 * between the two screens — see AccountSettingsScreen's own header comment).
 *
 * 2026-08-14 account-system repair: Institutional ID and its document
 * upload were removed completely (they made a normal registration
 * impossible to submit in practice — the Create Account button could never
 * enable without a document most users had no reason to have), Institution
 * became optional (not every user belongs to one), and User Type was cut
 * back to the four roles actually wanted. See
 * supabase/migrations/2026-08-14_account_system_repair.sql for the matching
 * database change — that migration also fixes the root cause of the
 * "column profiles.phone_country_code does not exist" production error:
 * the PREVIOUS migration that added phone_country_code/user_type/
 * education_level was written and verified locally but was never actually
 * applied to the production database, so the columns this file's Option
 * lists describe never existed there until now.
 *
 * Database-side enforcement: every enum below has a matching Postgres CHECK
 * constraint in supabase/migrations/2026-08-14_account_system_repair.sql,
 * naming the exact same values. That is not an accident either — a client
 * validator alone would only stop the app's own UI from submitting a bad
 * value, not a direct PostgREST call, and "userType/educationLevel have one
 * authoritative definition" has to hold at the database, not only in this
 * file.
 */

export interface Option {
  value: string;
  label: string;
}

/** Section 3 of the request this file implements. */
export const USER_TYPES: readonly Option[] = [
  { value: "student", label: "Student" },
  { value: "teacher_faculty", label: "Teacher / Faculty" },
  { value: "administrator", label: "Administrator" },
  { value: "freelance_researcher", label: "Freelance Researcher" },
] as const;

/** Section 4 of the request this file implements. */
export const EDUCATION_LEVELS: readonly Option[] = [
  { value: "secondary", label: "Secondary / High School" },
  { value: "undergraduate", label: "Undergraduate / Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "mphil", label: "MPhil" },
  { value: "phd", label: "PhD / Doctoral" },
  { value: "postdoctoral", label: "Postdoctoral" },
  { value: "faculty_academic", label: "Faculty / Academic Professional" },
  { value: "other", label: "Other" },
] as const;

export type UserTypeValue = (typeof USER_TYPES)[number]["value"];
export type EducationLevelValue = (typeof EDUCATION_LEVELS)[number]["value"];

export function isValidUserType(value: string): value is UserTypeValue {
  return USER_TYPES.some((o) => o.value === value);
}
export function isValidEducationLevel(value: string): value is EducationLevelValue {
  return EDUCATION_LEVELS.some((o) => o.value === value);
}

/* ----------------------------------------------------------------------
 * Field-level validators shared by registration and Account Settings.
 * -------------------------------------------------------------------- */

export function fullNameProblem(value: string): string | null {
  return value.trim().length === 0 ? "Full name is required." : null;
}

/**
 * Format only. Whether the username is actually free is checked separately —
 * SignUpScreen calls checkUsernameAvailable() on blur for real-time feedback,
 * but that check is advisory, not authoritative: it can race a concurrent
 * signup of the same username between the check and submission. The
 * database's `profiles.username unique` constraint is what actually
 * prevents a duplicate from being created, no matter what this function or
 * the availability check said.
 */
export function usernameProblem(value: string): string | null {
  const v = value.trim();
  if (v.length === 0) return "Username is required.";
  if (v.length < 3) return "Username must be at least 3 characters.";
  if (!/^[a-zA-Z0-9_.-]+$/.test(v)) return "Username can only contain letters, numbers, and . _ -";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailProblem(value: string): string | null {
  const v = value.trim();
  if (v.length === 0) return "Email is required.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address.";
  return null;
}

export function userTypeProblem(value: string): string | null {
  if (!value) return "User Type is required.";
  return isValidUserType(value) ? null : "Choose a valid user type.";
}

export function educationLevelProblem(value: string): string | null {
  if (!value) return "Level of Education is required.";
  return isValidEducationLevel(value) ? null : "Choose a valid education level.";
}
