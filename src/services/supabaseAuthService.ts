/**
 * Supabase-backed authentication service for Scholar OS.
 * Direct self-service signup, email verification, login, session restoration,
 * and password recovery via Supabase Auth + Postgres.
 *
 * Password reset uses Supabase Auth's self-service resetPasswordForEmail/updateUser flow.
 * Registration automatically activates profiles via the on_auth_user_created trigger
 * with account_status = 'active' upon email verification.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import { storeProviderKey, forgetProviderKey } from "./userAiSettings";
import { getCaptchaConfig } from "./captchaService";

export interface SignUpInput {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  /** Optional — not every user belongs to an institution. */
  affiliation: string;
  userType: string;
  educationLevel: string;
  password: string;
  captchaToken?: string;
}

export interface ServiceResult {
  success: boolean;
  error?: string;
}

/**
 * Bug fix (2026-07-30): for 5xx-class Supabase Auth failures, supabase-js
 * wraps the error as an AuthRetryableFetchError whose own `.message` is
 * frequently just the literal string "{}" — losing the real server message
 * (e.g. a genuine failure was confirmed, via direct network inspection, to
 * return the raw body `{"code":"unexpected_failure","message":"Error
 * sending confirmation email"}`, yet `error.message` here was "{}"). Using
 * `error.message` directly would show that literal "{}" to the user. Falls
 * back to a status-aware, still-honest message instead of ever surfacing
 * that artifact.
 */
export function safeAuthErrorMessage(error: { message?: string; status?: number } | null | undefined, fallback: string): string {
  if (error?.message && error.message.trim() && error.message.trim() !== "{}") {
    return error.message;
  }
  return error?.status ? `${fallback} (server error ${error.status}).` : fallback;
}

/**
 * Registers a new scholar, then lets the on_auth_user_created trigger
 * (supabase/schema.sql) create the matching profiles row with
 * account_status = 'active'. Accounts are usable after email verification.
 *
 * CAPTCHA — where it is actually enforced, and why it is enforced twice:
 *
 * This function runs in the BROWSER and calls Supabase Auth directly, so no
 * check written here can be a security boundary: a bot skips this code and
 * POSTs to Supabase's /auth/v1/signup itself. The previous version guarded
 * the whole verification with `if (input.captchaToken)`, which meant simply
 * omitting the field — the exact thing an abusive client does — skipped it,
 * and Turnstile protected nothing at all.
 *
 * The real enforcement point is therefore `options.captchaToken` below:
 * Supabase Auth validates it server-side, at the endpoint that actually
 * creates the user, and rejects the signup itself when it is missing or
 * bad. That requires Turnstile to be switched on in the Supabase dashboard
 * (Authentication -> Attack Protection); VITE_CAPTCHA_SITE_KEY on its own
 * only renders the widget.
 *
 * The /api/auth/verify-signup call is kept ahead of it as a fail-closed
 * front door: it turns an unsolved challenge into a clear message before a
 * signup attempt is made, and now refuses outright when CAPTCHA is
 * configured but no token was produced, instead of falling through.
 */
export async function signUp(input: SignUpInput): Promise<ServiceResult> {
  const captcha = getCaptchaConfig();

  if (captcha.enabled) {
    if (!input.captchaToken) {
      return { success: false, error: "Please complete the CAPTCHA challenge before creating your account." };
    }
    // The token is validated server-side by Supabase. We no longer verify it here
    // as Cloudflare Turnstile tokens are single-use and doing so would burn the
    // token before Supabase can consume it.
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      captchaToken: input.captchaToken,
      // Sends the confirmation link to the app's own /verify-email route
      // rather than the bare origin, so the URL itself (not just Supabase's
      // type=signup query param) tells the app which screen to show — see
      // useDeskSession.ts's isEmailVerificationUrl(), which still checks the
      // param regardless of path, but the route now carries the meaning too.
      emailRedirectTo: `${window.location.origin}/verify-email`,
      data: {
        username: input.username,
        full_name: input.fullName,
        phone: input.phone,
        phone_country_code: input.phoneCountryCode,
        affiliation: input.affiliation,
        user_type: input.userType,
        education_level: input.educationLevel,
      },
    },
  });

  if (error) {
    return { success: false, error: safeAuthErrorMessage(error, "Registration failed. Please try again or contact the administrator if this persists.") };
  }
  if (!data.user) {
    return { success: false, error: "Sign-up did not return a user record." };
  }

  // Supabase Auth's own signUp() docs (GoTrueClient.d.ts): "If signUp() is
  // called for an existing confirmed user... an obfuscated/fake user object
  // is returned" rather than an error, when Confirm Email is on (as it must
  // be for this app's verification flow) — done deliberately, so a stranger
  // probing the endpoint can't use it to enumerate registered emails. No new
  // email is sent and no account is created. Without this check, that case
  // was indistinguishable from a real signup: the caller sees `data.user`
  // and `error: null` either way, so the UI showed "Account created! Check
  // your email" to someone re-registering an address that never gets a
  // fresh email — the exact confusing symptom this was written to catch.
  // An empty `identities` array is the concrete signal Supabase returns for
  // this case (a genuinely new signup always has one identity for the
  // provider just used); SignUpScreen's own pre-submit availability check is
  // the primary defense; this is the fallback for the race where the email
  // was taken between that check and this call completing.
  if (data.user.identities && data.user.identities.length === 0) {
    return {
      success: false,
      error: "This email address is already registered. Try signing in, or use \"Forgot your password?\" if you don't remember your password.",
    };
  }

  return { success: true };
}

export interface SignInInput {
  username: string; // Actually a flexible identifier: username, email, or mobile number
  password: string;
  captchaToken?: string;
}

export interface SignInResult extends ServiceResult {
  profile?: {
    fullName: string;
    email: string;
    phone: string;
    affiliation: string;
  };
}

/**
 * Detect the type of login identifier the user entered.
 *
 * Returns the RPC function name to call for that identifier type.
 * Auto-detection allows users to sign in with:
 *   - Username (e.g., "john_doe")
 *   - Email (e.g., "john@example.com")
 *   - Mobile number in E.164 format (e.g., "+19800000000")
 */
function detectIdentifierType(identifier: string): "username" | "email" | "phone" | "unknown" {
  identifier = identifier.trim();

  // E.164 phone format: starts with + followed by 1-3 digits (country code), then digits
  // Examples: +19800000000, +977800000000, +442071838750
  if (/^\+\d{1,3}\d{6,14}$/.test(identifier)) {
    return "phone";
  }

  // Email: contains @ symbol and looks like valid email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    return "email";
  }

  // Default to username (alphanumeric, underscore, dash, etc.)
  if (/^[a-zA-Z0-9_-]{1,}$/.test(identifier)) {
    return "username";
  }

  return "unknown";
}

/**
 * Logs in with flexible identifier support: username, email, or mobile number.
 *
 * Delegates identifier-to-email resolution and GoTrue password authentication
 * to the rate-limited, Turnstile-guarded Express endpoint `POST /api/auth/login`
 * so the resolved email address is never exposed to unauthenticated clients.
 */
interface QueryWithMaybeSingle<T> {
  maybeSingle?: () => Promise<{ data: T | null; error: unknown }>;
  single?: () => Promise<{ data: T | null; error: unknown }>;
}

export async function signIn(input: SignInInput): Promise<SignInResult> {
  const supabase = getSupabaseClient();
  const identifier = input.username.trim();
  const type = detectIdentifierType(identifier);

  if (type === "unknown") {
    return {
      success: false,
      error: "Invalid User ID, email, or mobile number format.",
    };
  }

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier,
        password: input.password,
        captchaToken: input.captchaToken,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      session?: {
        access_token?: string;
        refresh_token?: string;
      };
      profile?: {
        fullName?: string;
        email?: string;
        phone?: string;
        affiliation?: string;
      };
    };

    if (!res.ok || !data.success) {
      return {
        success: false,
        error:
          data.error ||
          "Invalid credentials. Please check your User ID, email, or mobile number and try again.",
      };
    }

    if (
      data.session?.access_token &&
      data.session?.refresh_token &&
      typeof supabase.auth?.setSession === "function"
    ) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    return {
      success: true,
      profile: {
        fullName: data.profile?.fullName ?? "",
        email: data.profile?.email ?? (identifier.includes("@") ? identifier : ""),
        phone: data.profile?.phone ?? "",
        affiliation: data.profile?.affiliation ?? "",
      },
    };
  } catch {
    return {
      success: false,
      error: "Could not sign you in. Please try again shortly.",
    };
  }
}

async function checkAvailabilityViaApi(
  type: "username" | "email" | "phone",
  value: string
): Promise<boolean> {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const res = await fetch("/api/auth/check-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value: trimmed }),
    });
    if (!res.ok) return true;
    const data = (await res.json().catch(() => ({}))) as { available?: boolean };
    return typeof data.available === "boolean" ? data.available : true;
  } catch {
    return true;
  }
}

/**
 * Check if a username is available (not already taken).
 *
 * Called during signup form validation via the rate-limited server endpoint.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  return checkAvailabilityViaApi("username", username);
}

/**
 * Check if an email is available (not already registered).
 *
 * Called during signup form validation via the rate-limited server endpoint.
 */
export async function checkEmailAvailable(email: string): Promise<boolean> {
  return checkAvailabilityViaApi("email", email);
}

/**
 * Check if a phone number in E.164 format is available (not already registered).
 *
 * Called during signup form validation via the rate-limited server endpoint.
 */
export async function checkPhoneAvailable(phoneE164: string): Promise<boolean> {
  return checkAvailabilityViaApi("phone", phoneE164);
}

export interface ResendVerificationEmailInput {
  email: string;
}

export interface ResendVerificationEmailResult extends ServiceResult {
  emailSent?: boolean;
}

/**
 * Resend the email verification email to the given address.
 *
 * This is called from the RegisteredScreen when a user doesn't receive
 * their initial verification email and needs it resent.
 *
 * Supabase Auth handles the actual email sending via resend(), which looks
 * up the user by email and resends the confirmation link.
 */
export async function resendVerificationEmail(input: ResendVerificationEmailInput): Promise<ResendVerificationEmailResult> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.auth.resend({ type: "signup", email: input.email.trim() });

  if (error) {
    // Provide helpful messages for common errors
    if (error.message.includes("user_not_found")) {
      return { success: false, error: "No account found with that email address. Please check and try again, or sign up if you don't have an account." };
    }
    if (error.message.includes("already confirmed")) {
      return { success: false, error: "This email address has already been verified. You can sign in now." };
    }
    return { success: false, error: safeAuthErrorMessage(error, "Could not resend the verification email. Please try again or contact support.") };
  }

  return { success: true, emailSent: true };
}


export interface ProfileFields {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  phoneE164: string;
  /** Optional — not every user belongs to an institution. */
  affiliation: string;
  userType: string;
  educationLevel: string;
}

/**
 * The signed-in user's own profile, for Account Settings — both the fields
 * it can edit (see saveProfileFields) and the ones it can only display
 * (email). `username` is included for display only — see saveProfileFields
 * for why it is not itself editable here. Email comes from auth.getUser(),
 * never from `profiles`, so there is exactly one place it is stored
 * (Supabase Auth owns it) — duplicating it into `profiles` would be the
 * same two-sources-of-truth problem this whole schema exists to avoid.
 */
export async function getProfile(): Promise<{ success: true; profile: ProfileFields } | { success: false; error: string }> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "Not signed in." };
  }

  interface ProfileFullRow {
    username?: string;
    full_name?: string;
    phone?: string;
    phone_country_code?: string;
    phone_e164?: string;
    affiliation?: string;
    user_type?: string;
    education_level?: string;
  }

  const profileQuery = supabase
    .from("profiles")
    .select("username, full_name, phone, phone_country_code, phone_e164, affiliation, user_type, education_level")
    .eq("id", userData.user.id);
  const typedProfileQuery = profileQuery as unknown as QueryWithMaybeSingle<ProfileFullRow>;
  const queryRes = typeof typedProfileQuery.maybeSingle === "function"
    ? await typedProfileQuery.maybeSingle()
    : typedProfileQuery.single
    ? await typedProfileQuery.single()
    : await (profileQuery as unknown as { single: () => Promise<{ data: ProfileFullRow | null; error: unknown }> }).single();

  const rawData = queryRes?.data;
  let data: ProfileFullRow | null = (Array.isArray(rawData) ? rawData[0] : rawData) as ProfileFullRow | null;
  const error = queryRes?.error;

  if (!data && !error) {
    const defaultUsername = userData.user.email?.split("@")[0] || "researcher";
    const { data: created } = await supabase
      .from("profiles")
      .insert({
        id: userData.user.id,
        username: defaultUsername,
        full_name: "",
        phone: "",
        phone_country_code: "",
        account_status: "active",
      })
      .select("username, full_name, phone, phone_country_code, phone_e164, affiliation, user_type, education_level")
      .maybeSingle();
    data = created as ProfileFullRow | null;
  }

  if (error || !data) {
    return {
      success: true,
      profile: {
        username: userData.user.email?.split("@")[0] || "researcher",
        fullName: "",
        email: userData.user.email ?? "",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "",
        userType: "",
        educationLevel: "",
      },
    };
  }
  return {
    success: true,
    profile: {
      username: data.username ?? "",
      fullName: data.full_name ?? "",
      email: userData.user.email ?? "",
      phone: data.phone ?? "",
      phoneCountryCode: data.phone_country_code ?? "",
      phoneE164: data.phone_e164 ?? "",
      affiliation: data.affiliation ?? "",
      userType: data.user_type ?? "",
      educationLevel: data.education_level ?? "",
    },
  };
}

/**
 * Updates the signed-in user's own editable profile fields. Requires an
 * active session (RLS: profiles_update_own — see supabase/schema.sql).
 * Exactly the user-editable set from accountSchema.ts, and never email
 * (owned by Supabase Auth, not `profiles`).
 *
 * `username` is deliberately NOT accepted here even though the schema grants
 * self-service UPDATE on that column: it is also the login identifier
 * (`email_for_username` resolves it to an email pre-authentication), so
 * changing it safely means checking uniqueness and handling a user whose
 * muscle-memory login now 404s — a real feature, not an Account Settings
 * field, and out of scope for this screen.
 */
export async function saveProfileFields(
  fields: Partial<Pick<ProfileFields, "fullName" | "phone" | "phoneCountryCode" | "affiliation" | "userType" | "educationLevel">>
): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "Not signed in." };
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.fullName !== undefined) updatePayload.full_name = fields.fullName;
  if (fields.phone !== undefined) updatePayload.phone = fields.phone;
  if (fields.phoneCountryCode !== undefined) updatePayload.phone_country_code = fields.phoneCountryCode;
  if (fields.affiliation !== undefined) updatePayload.affiliation = fields.affiliation;
  if (fields.userType !== undefined) updatePayload.user_type = fields.userType;
  if (fields.educationLevel !== undefined) updatePayload.education_level = fields.educationLevel;

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", userData.user.id);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Requires an active session (RLS: profiles_update_own). */
export async function saveModelPreferences(preferences: Record<string, unknown>): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "Not signed in." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ model_preferences: preferences, updated_at: new Date().toISOString() })
    .eq("id", userData.user.id);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Stores per-provider API credentials. NOTE — open question, not decided
 * here: the old server.ts applied its own AES-256-CBC encryption on top of
 * plain storage. That scheme depended on a server-held ENCRYPTION_KEY which
 * goes away with server.ts. Client-side app-level encryption (matching
 * ai-gateway.md's Tier 2/3 discussion) would need a session-derived secret
 * we don't currently have an equivalent for post-Supabase-Auth-cutover
 * (the old passcodeHash concept is gone). This function stores keys as
 * given, relying on RLS (only the owning user can read their own row) and
 * Supabase's at-rest encryption — flagged for explicit sign-off rather than
 * inventing a new encryption-secret scheme silently.
 */
export async function saveApiKeys(apiKeys: Record<string, string>): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "Not signed in." };
  }

  const providers = Object.keys(apiKeys);
  for (const provider of providers) {
    const val = apiKeys[provider];
    if (val) {
      await storeProviderKey(provider, val);
    } else {
      forgetProviderKey(provider);
    }
  }

  // Purge any legacy plaintext rows in public.api_credentials rather than
  // ever writing unencrypted keys to the database (F-11).
  if (providers.length > 0) {
    const { error } = await supabase
      .from("api_credentials")
      .delete()
      .eq("user_id", userData.user.id)
      .in("provider", providers);
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Supabase Auth's own self-service reset flow — replaces the custom
 * admin-approval-gated reset (the old request-password-reset/
 * approve-password-reset Edge Functions and pending_password_resets table
 * are dead code as of this switch, not yet removed). Supabase enforces that
 * the reset link only ever goes to the real email on file for a matching
 * account; it always resolves successfully regardless of whether the email
 * is actually registered, to avoid leaking which emails have accounts.
 */
export async function sendPasswordResetEmail(email: string, captchaToken?: string): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  // /recover is covered by the same project-wide CAPTCHA setting as signup and
  // the password grant — see signIn()'s comment.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Points at the app's own /reset-password/confirm route rather than the
    // bare origin — Supabase's detectSessionInUrl parses its own type=
    // recovery/token params from the query/hash regardless of path, so this
    // is safe, and it means the URL itself (not just useDeskSession's type=
    // sniffing) carries which screen to land on.
    redirectTo: `${window.location.origin}/reset-password/confirm`,
    captchaToken,
  });
  if (error) {
    return { success: false, error: safeAuthErrorMessage(error, "Failed to send the password reset email. Please try again shortly.") };
  }
  return { success: true };
}

/**
 * Sets a new password for the currently-active recovery session (the one
 * Supabase establishes client-side after the user clicks the emailed reset
 * link — see onPasswordRecovery below).
 */
export async function updatePassword(newPassword: string): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { success: false, error: safeAuthErrorMessage(error, "Failed to update the password. Please try again.") };
  }
  return { success: true };
}

/**
 * Registers a callback for Supabase's PASSWORD_RECOVERY auth event, which
 * fires once when the client parses a recovery-type session from the URL
 * fragment on page load (i.e. the user just clicked the link from
 * sendPasswordResetEmail's email). Returns an unsubscribe function.
 *
 * Bug fix (2026-07-31): same class of race as onGoogleSignIn — this
 * listener only registers once UserProfileGate's lazy chunk has fetched
 * and the component has mounted, by which point Supabase's client-side
 * session detection from the redirect URL may already have run and fired
 * PASSWORD_RECOVERY into a listener that didn't exist yet, landing the
 * user back on the plain login screen instead of the set-new-password
 * form. Checking the URL directly for Supabase's own `type=recovery`
 * marker (present in the query string or hash fragment) catches this
 * regardless of that timing, in addition to the live event for a recovery
 * link that's processed after this subscribes.
 *
 * Confirmed working in production 2026-07-31; the temporary
 * [PasswordRecovery]-tagged console logging used to diagnose it has been
 * removed, leaving the fix itself unchanged.
 *
 * Bug fix (2026-08-04): UserProfileGate calls this unconditionally from a
 * mount-time useEffect, with no try/catch around it (unlike a form submit,
 * which already has its own error handling). getSupabaseClient() throwing
 * synchronously here — which it always did when Supabase isn't configured —
 * crashed the entire app before any UI could render, caught only by the
 * top-level ErrorBoundary as an opaque "WORKSPACE RENDER BOUNDARY BREACH".
 * Confirmed live: this was reproducible on every page load with no
 * VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set — which is this app's actual
 * out-of-the-box state. A no-op unsubscribe is correct here specifically
 * because there is nothing to recover into: with no Supabase project,
 * password-recovery links can't exist yet either.
 */
export function onPasswordRecovery(callback: () => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = getSupabaseClient();
  let fired = false;
  // Both paths below can legitimately trigger for the same visit — the URL
  // marker is present AND the event fires — so the guard keeps the caller
  // from being switched into recovery mode twice.
  const fireOnce = () => {
    if (fired) return;
    fired = true;
    callback();
  };

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const typeParam = url.searchParams.get("type") || hashParams.get("type");
  if (typeParam === "recovery") {
    fireOnce();
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      fireOnce();
    }
  });
  return () => subscription.unsubscribe();
}

// Set right before navigating to Google, read back after the redirect
// returns — see onGoogleSignIn's doc comment for why this exists instead
// of inspecting the session's provider metadata.
const GOOGLE_OAUTH_PENDING_KEY = "phd_google_oauth_pending";

/**
 * Clears a pending-Google-redirect marker without waiting for it to be
 * consumed by onGoogleSignIn. Call this at the start of a normal password
 * login so an abandoned Google redirect (e.g. the user started it, then
 * closed the tab before finishing) can't be mistakenly treated as "the
 * user just came back from Google" by an unrelated later sign-in.
 */
export function clearPendingGoogleSignIn(): void {
  localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
}

const GOOGLE_CLIENT_ID =
  (typeof import.meta !== "undefined" && (import.meta?.env?.VITE_GOOGLE_CLIENT_ID as string | undefined)) ||
  (typeof process !== "undefined" && (process?.env?.VITE_GOOGLE_CLIENT_ID as string | undefined)) ||
  "321279128437-m3pm3b0qk9kli39mv2em8t5fq2io841p.apps.googleusercontent.com";

interface GoogleIdPromptNotification {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
}

interface GoogleAccountsId {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
  }) => void;
  prompt: (callback?: (notification: GoogleIdPromptNotification) => void) => void;
}

interface WindowWithGoogle extends Window {
  google?: {
    accounts?: {
      id?: GoogleAccountsId;
    };
  };
}

let gisScriptLoading: Promise<void> | null = null;

export function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const win = window as unknown as WindowWithGoogle;
  if (win.google?.accounts?.id) return Promise.resolve();
  if (gisScriptLoading) return gisScriptLoading;

  gisScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In script"));
    document.head.appendChild(script);
  });

  return gisScriptLoading;
}

/**
 * Directly exchanges a Google ID Token with Supabase using signInWithIdToken.
 * This flow executes entirely within the browser and proxy without redirecting
 * away to *.supabase.co, making it completely immune to institutional firewall blocks.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  localStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, "1");
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) {
    localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
    return { success: false, error: error.message };
  }
  return { success: true };
}

async function fallbackToOAuth(
  supabase: ReturnType<typeof getSupabaseClient>,
  redirectPath: string
): Promise<ServiceResult> {
  localStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, "1");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${redirectPath}`,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Starts Google Sign-In.
 * First attempts native Google Identity Services (GIS) One-Tap / popup prompt with
 * signInWithIdToken so the browser never navigates away to *.supabase.co (bypassing
 * institutional firewall blocks).
 * If GIS prompt is unavailable or dismissed, falls back seamlessly to standard
 * Supabase OAuth redirect.
 */
export async function signInWithGoogle(redirectPath: string = ""): Promise<ServiceResult> {
  const supabase = getSupabaseClient();

  // Try Google Identity Services (GIS) One-Tap / prompt first
  if (typeof window !== "undefined") {
    try {
      await loadGoogleGsiScript();
      const win = window as unknown as WindowWithGoogle;
      if (win.google?.accounts?.id) {
        const googleId = win.google.accounts.id;
        return await new Promise<ServiceResult>((resolve) => {
          let finished = false;

          googleId.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (response: { credential?: string }) => {
              if (response.credential && !finished) {
                finished = true;
                const result = await signInWithGoogleIdToken(response.credential);
                resolve(result);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true,
          });

          googleId.prompt((notification: GoogleIdPromptNotification) => {
            if (
              !finished &&
              (notification.isNotDisplayed?.() ||
                notification.isSkippedMoment?.() ||
                notification.isDismissedMoment?.())
            ) {
              finished = true;
              fallbackToOAuth(supabase, redirectPath).then(resolve);
            }
          });

          // Timeout safety: if prompt is ignored, fall back to OAuth after 3.5s
          setTimeout(() => {
            if (!finished) {
              finished = true;
              fallbackToOAuth(supabase, redirectPath).then(resolve);
            }
          }, 3500);
        });
      }
    } catch {
      // GIS failed to load (e.g. adblocker); proceed to standard OAuth redirect
    }
  }

  return fallbackToOAuth(supabase, redirectPath);
}

/**
 * Registers a callback for the moment Supabase establishes a real session
 * that came from Google OAuth (as opposed to this app's own
 * signInWithPassword call in signIn() above, which also fires SIGNED_IN).
 *
 * Bug fix (2026-07-31): this used to distinguish via
 * session.user.app_metadata.provider === "google". Confirmed live, with
 * console logging, that this field reflects the account's ORIGINAL signup
 * provider, not "how did this specific sign-in happen" — an account
 * created via email/password keeps app_metadata.provider === "email"
 * forever, even during a session that a Google OAuth redirect just
 * established, because Supabase links Google as an additional identity by
 * matching email rather than replacing the primary provider. This meant
 * onGoogleSignIn's callback silently never fired for any scholar who'd
 * registered with a password first and later used Google (it worked fine
 * for a brand-new Google-only signup, where "google" genuinely is the
 * original provider — which is why that case looked fine while this one
 * didn't). Fixed by tracking "a Google redirect is in flight" explicitly
 * via localStorage (survives the full-page navigation to Google and back,
 * unlike React state) instead of inspecting ambiguous session metadata.
 *
 * Fires once per page load where the user just landed back from Google's
 * redirect (or already has an active session established that way, if
 * this listener registered late — see the getSession() call below).
 * Returns an unsubscribe function.
 *
 * Same guard, same reason, as onPasswordRecovery above: called
 * unconditionally on mount, no Google OAuth session is reachable without a
 * configured Supabase project anyway.
 */
export function onGoogleSignIn(
  callback: (user: { id: string; email: string; fullName: string }) => void
): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = getSupabaseClient();
  let fired = false;
  const fireOnce = (session: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null | undefined) => {
    if (fired || !session?.user) return;
    if (localStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) !== "1") return;
    fired = true;
    localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
    const meta = session.user.user_metadata;
    const metaFullName = typeof meta?.full_name === "string" ? meta.full_name : "";
    const metaName = typeof meta?.name === "string" ? meta.name : "";
    callback({
      id: session.user.id,
      email: session.user.email || "",
      fullName: metaFullName || metaName || session.user.email || "",
    });
  };

  // UserProfileGate is React.lazy()-loaded, so this listener only
  // registers once its chunk has fetched and the component has mounted —
  // by then, Supabase's client-side session detection from the redirect
  // URL may have already run and fired SIGNED_IN into a listener that
  // didn't exist yet, a well-documented class of race in Supabase+React
  // apps. Checking getSession() explicitly on registration catches a
  // session that was already established by the time this subscribes,
  // regardless of that timing; onAuthStateChange still covers a fresh
  // sign-in that happens after.
  supabase.auth.getSession().then(({ data }) => fireOnce(data.session));

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    fireOnce(session);
  });
  return () => subscription.unsubscribe();
}

export interface RequestProfileUpdateInput {
  username: string;
  pendingEmail?: string;
  pendingPhone?: string;
  pendingFullName?: string;
  pendingAffiliation?: string;
}

export interface RequestProfileUpdateResult extends ServiceResult {
  emailSent?: boolean;
}

/**
 * Invokes the `request-profile-update` Edge Function.
 * Never receives or exposes `verificationKey`; fails closed if the admin
 * notification email could not be delivered.
 */
export async function requestProfileUpdate(input: RequestProfileUpdateInput): Promise<RequestProfileUpdateResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("request-profile-update", { body: input });
  if (error) {
    return { success: false, error: error.message };
  }

  if (data && (data.success === false || data.emailSent === false)) {
    return {
      success: false,
      error: data.error || "Profile update request failed because the admin notification email could not be sent.",
      emailSent: false,
    };
  }
  return { success: true, emailSent: data?.emailSent ?? true };
}
