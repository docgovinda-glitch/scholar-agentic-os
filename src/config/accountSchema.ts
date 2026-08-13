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
 * between the two screens — see AccountSettingsScreen's own header comment),
 * and the file itself (the institutional ID document) is handled by
 * services/supabaseAuthService.ts's uploadIdDocument, since a File object
 * cannot be JSON-serialised the way every other field here can.
 *
 * Database-side enforcement: every enum below has a matching Postgres CHECK
 * constraint in supabase/migrations/2026-08-13_unified_account_profile.sql,
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
  { value: "independent_researcher", label: "Independent Researcher" },
  { value: "research_professional", label: "Research Professional" },
  { value: "other", label: "Other" },
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

/**
 * Institutional ID verification state (section 5). System-controlled end to
 * end: neither the RLS column grant nor any client function lets a user set
 * this directly (see the migration's submit_id_document() function) — a
 * self-service upload can only ever move a row to 'pending_verification',
 * and only an administrator (service role) can reach 'verified'/'rejected'.
 */
export const VERIFICATION_STATUSES: readonly Option[] = [
  { value: "verification_required", label: "Verification Required" },
  { value: "pending_verification", label: "Pending Verification" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]["value"];

export function verificationStatusLabel(status: string | null | undefined): string {
  return VERIFICATION_STATUSES.find((o) => o.value === status)?.label ?? "Verification Required";
}

/**
 * The institutional ID document itself (section 5). Enforced both here (so
 * the UI can reject a bad file before spending an upload) and again at the
 * Storage bucket (a client-side check alone is never a security boundary —
 * see supabase/migrations/2026-08-13_unified_account_profile.sql's bucket
 * config for the same limit applied server-side).
 */
export const ID_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ID_DOCUMENT_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const ID_DOCUMENT_ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp";
export const ID_DOCUMENT_HELP_TEXT = "Upload your valid student, faculty, staff, or institutional identification document.";

export function idDocumentProblem(file: File | null): string | null {
  if (!file) return "An institutional ID document is required.";
  if (!(ID_DOCUMENT_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return "That file type isn't accepted. Use a PDF, JPG, PNG, or WEBP.";
  }
  if (file.size > ID_DOCUMENT_MAX_BYTES) {
    return "That file is too large. The limit is 10 MB.";
  }
  if (file.size === 0) {
    return "That file appears to be empty.";
  }
  return null;
}

/* ----------------------------------------------------------------------
 * Field-level validators shared by registration and Account Settings.
 * -------------------------------------------------------------------- */

export function fullNameProblem(value: string): string | null {
  return value.trim().length === 0 ? "Full name is required." : null;
}

/**
 * Format only — whether the username is actually free is a uniqueness
 * question the database's own `profiles.username unique` constraint settles
 * authoritatively (see signUp()'s doc comment on why a client-side
 * availability check would just be a second, racy source of truth).
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

export function affiliationProblem(value: string): string | null {
  return value.trim().length === 0 ? "Institution / Organization is required." : null;
}

export function institutionalIdProblem(value: string): string | null {
  return value.trim().length === 0 ? "Institutional ID is required." : null;
}

export function userTypeProblem(value: string): string | null {
  if (!value) return "User Type is required.";
  return isValidUserType(value) ? null : "Choose a valid user type.";
}

export function educationLevelProblem(value: string): string | null {
  if (!value) return "Level of Education is required.";
  return isValidEducationLevel(value) ? null : "Choose a valid education level.";
}
