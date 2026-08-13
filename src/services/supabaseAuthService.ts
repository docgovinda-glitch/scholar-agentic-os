/**
 * Supabase-backed replacement for the auth/user/admin routes in server.ts
 * (Phase 1 — docs/planning/hosting-and-topology.md §4's "moves to BaaS"
 * bucket). Wired into UserProfileGate.tsx (registration, login, password
 * reset); ProfileSettings.tsx and AIControlCenter.tsx still call the old
 * Express routes — not yet cut over.
 *
 * Password reset uses Supabase Auth's own resetPasswordForEmail/updateUser
 * flow, not a custom admin-approval gate — see sendPasswordResetEmail's own
 * doc comment. The registration admin-approval action (approve-registration)
 * is NOT here — it runs as a Supabase Edge Function (supabase/functions/)
 * using the service_role key, since approving another user's account must
 * never be possible from the anon-key client.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
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
    try {
      const verifyResponse = await fetch("/api/auth/verify-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken: input.captchaToken }),
      });

      if (!verifyResponse.ok) {
        const errorData = (await verifyResponse.json().catch(() => ({}))) as { error?: string };
        return { success: false, error: errorData.error || "CAPTCHA verification failed. Please try again." };
      }
    } catch (error) {
      return { success: false, error: `CAPTCHA verification error: ${error instanceof Error ? error.message : "unknown"}` };
    }
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      captchaToken: input.captchaToken,
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
 * Resolve a flexible login identifier (username, email, or phone) to an email address.
 *
 * Called during sign-in to get the email for Supabase Auth's signInWithPassword,
 * which requires email even when the user logged in with username or phone.
 */
async function resolveIdentifierToEmail(identifier: string): Promise<{ email: string | null; error?: string }> {
  const supabase = getSupabaseClient();
  const type = detectIdentifierType(identifier);

  if (type === "unknown") {
    return { email: null, error: "Invalid User ID, email, or mobile number format." };
  }

  if (type === "username") {
    const { data: email, error } = await supabase.rpc("email_for_username", {
      lookup_username: identifier,
    });
    return { email: email ?? null, error: error ? "No account found with that User ID." : undefined };
  }

  if (type === "email") {
    // Email lookup: directly query auth.users or use a dedicated RPC
    // For now, we'll handle this on the next Supabase signInWithPassword call
    // by trying email directly. If the email doesn't exist in auth.users,
    // signInWithPassword will fail with "Invalid login credentials."
    return { email: identifier };
  }

  if (type === "phone") {
    const { data: email, error } = await supabase.rpc("email_for_phone_e164", {
      lookup_phone_e164: identifier,
    });
    return { email: email ?? null, error: error ? "No account found with that mobile number." : undefined };
  }

  return { email: null, error: "Could not resolve login identifier." };
}

/**
 * Logs in with flexible identifier support: username, email, or mobile number.
 *
 * Auto-detects which type of identifier was entered, resolves it to an email,
 * then authenticates with Supabase Auth.
 *
 * Carries a CAPTCHA token for the same reason signUp() does: Supabase Auth's
 * CAPTCHA setting is per-PROJECT, not per-endpoint. Switching it on protects
 * the password grant behind this call and the /recover endpoint behind
 * sendPasswordResetEmail() at the same moment it protects signup.
 */
export async function signIn(input: SignInInput): Promise<SignInResult> {
  const supabase = getSupabaseClient();

  // Resolve the flexible identifier (username, email, or phone) to an email address
  const { email, error: resolveError } = await resolveIdentifierToEmail(input.username);

  if (!email) {
    // Provide a generic error that doesn't confirm/deny account existence
    return { success: false, error: resolveError || "Invalid credentials. Please check your User ID, email, or mobile number and try again." };
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
    options: { captchaToken: input.captchaToken },
  });

  if (signInError) {
    return { success: false, error: "Incorrect password. Please try again." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, phone, affiliation, account_status")
    .eq("id", signInData.user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Scholar profile not found." };
  }

  if (profile.account_status !== 'active') {
    const statusMessages: Record<string, string> = {
      'restricted': 'Your account has been restricted. Please contact support.',
      'suspended': 'Your account has been suspended. Please contact support.',
      'deleted': 'Your account has been deleted.',
    };
    const statusMessage = statusMessages[profile.account_status as string] || 'Your account is not active.';
    return { success: false, error: statusMessage };
  }

  return {
    success: true,
    profile: {
      fullName: profile.full_name,
      email,
      phone: profile.phone,
      affiliation: profile.affiliation,
    },
  };
}

/**
 * Check if a username is available (not already taken).
 *
 * Called during signup form validation to provide real-time feedback
 * as the user types a username.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: isAvailable, error } = await supabase.rpc("check_username_available", {
    lookup_username: username.trim(),
  });
  if (error) return false; // On error, assume not available (fail safe)
  return isAvailable ?? false;
}

/**
 * Check if an email is available (not already registered).
 *
 * Called during signup form validation to provide real-time feedback
 * as the user enters an email address.
 */
export async function checkEmailAvailable(email: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: isAvailable, error } = await supabase.rpc("check_email_available", {
    lookup_email: email.trim(),
  });
  if (error) return false; // On error, assume not available (fail safe)
  return isAvailable ?? false;
}

/**
 * Check if a phone number in E.164 format is available (not already registered).
 *
 * Called during signup form validation to provide real-time feedback
 * as the user enters a phone number.
 */
export async function checkPhoneAvailable(phoneE164: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: isAvailable, error } = await supabase.rpc("check_phone_available", {
    lookup_phone_e164: phoneE164.trim(),
  });
  if (error) return false; // On error, assume not available (fail safe)
  return isAvailable ?? false;
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

  const { data, error } = await supabase
    .from("profiles")
    .select("username, full_name, phone, phone_country_code, phone_e164, affiliation, user_type, education_level")
    .eq("id", userData.user.id)
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Could not load your profile." };
  }
  return {
    success: true,
    profile: {
      username: data.username,
      fullName: data.full_name,
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
  fields: Pick<ProfileFields, "fullName" | "phone" | "phoneCountryCode" | "affiliation" | "userType" | "educationLevel">
): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "Not signed in." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fields.fullName,
      phone: fields.phone,
      phone_country_code: fields.phoneCountryCode,
      affiliation: fields.affiliation,
      user_type: fields.userType,
      education_level: fields.educationLevel,
      updated_at: new Date().toISOString(),
    })
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
  const toDelete = providers.filter((p) => !apiKeys[p]);
  const toUpsert = providers.filter((p) => apiKeys[p]);

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("api_credentials")
      .delete()
      .eq("user_id", userData.user.id)
      .in("provider", toDelete);
    if (error) return { success: false, error: error.message };
  }

  if (toUpsert.length > 0) {
    const rows = toUpsert.map((provider) => ({
      user_id: userData.user!.id,
      provider,
      encrypted_api_key: apiKeys[provider],
      api_key_hash: "", // hashing strategy is part of the same open question noted above
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("api_credentials").upsert(rows, { onConflict: "user_id,provider" });
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
    redirectTo: window.location.origin,
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

/**
 * Starts Supabase's own Google OAuth redirect flow. Replaces the old
 * client-side Google Identity Services implementation entirely — there is
 * no VITE_GOOGLE_CLIENT_ID, no window.google.accounts.oauth2 token client,
 * and no manual userinfo fetch anymore. Supabase (already configured with
 * the Google provider in the dashboard) handles the full redirect
 * round-trip and establishes the session itself; this call only kicks
 * that off. The browser navigates away on success, so callers generally
 * don't need to do anything with a resolved promise — only the rejection
 * path (Supabase itself failing to even start the redirect) is
 * meaningful here.
 */
export async function signInWithGoogle() {
  const supabase = getSupabaseClient();
  localStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, "1");
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
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
  const fireOnce = (session: { user: { id: string; email?: string; user_metadata?: any } } | null | undefined) => {
    if (fired || !session?.user) return;
    if (localStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) !== "1") return;
    fired = true;
    localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
    callback({
      id: session.user.id,
      email: session.user.email || "",
      fullName:
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        session.user.email ||
        "",
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
  /** Plain key, present so ProfileSettings.tsx can show it as a sandbox-bypass notice exactly as server.ts's route did — never persisted, only ever surfaced transiently in the UI. */
  verificationKey?: string;
  /** SHA-256 of verificationKey, computed here (client-side, same algorithm ProfileSettings.tsx's own sha256() helper uses) since the request-profile-update Edge Function only returns the plain key — server.ts's old route computed this hash server-side instead; the two are equivalent, just relocated. */
  keyHash?: string;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stateless, matching server.ts's current behavior exactly — this Edge Function only sends the admin/user notification emails, same as /api/request-profile-update did; it does not persist or apply the change itself. */
export async function requestProfileUpdate(input: RequestProfileUpdateInput): Promise<RequestProfileUpdateResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("request-profile-update", { body: input });
  if (error) {
    return { success: false, error: error.message };
  }

  const verificationKey: string | undefined = data?.verificationKey;
  const keyHash = verificationKey ? await sha256(verificationKey) : undefined;

  if (data && data.emailSent === false) {
    return {
      success: true,
      error: `Update request created, but the admin notification email couldn't be sent${data.error ? `: ${data.error}` : "."}`,
      emailSent: false,
      verificationKey,
      keyHash,
    };
  }
  return { success: true, emailSent: data?.emailSent, verificationKey, keyHash };
}
