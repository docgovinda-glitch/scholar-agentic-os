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

import { getSupabaseClient } from "./supabaseClient";

export interface SignUpInput {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  affiliation: string;
  authenticId: string;
  password: string;
}

export interface ServiceResult {
  success: boolean;
  error?: string;
}

/**
 * Registers a new scholar. Supabase Auth creates the auth.users row;
 * the on_auth_user_created trigger (supabase/schema.sql) creates the
 * matching profiles row with is_approved = false. Then invokes the
 * send-approval-email Edge Function so an admin gets the same
 * approve-registration email server.ts used to send via Resend.
 */
export async function signUp(input: SignUpInput): Promise<ServiceResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
        full_name: input.fullName,
        phone: input.phone,
        affiliation: input.affiliation,
        authentic_id: input.authenticId,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data.user) {
    return { success: false, error: "Sign-up did not return a user record." };
  }

  const { data: emailData, error: emailError } = await supabase.functions.invoke("send-approval-email", {
    body: {
      userId: data.user.id,
      username: input.username,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      affiliation: input.affiliation,
      authenticId: input.authenticId,
    },
  });

  if (emailError) {
    // Registration itself succeeded — the admin-notification email failing
    // shouldn't block the user's signup, but it should be visible to them
    // (mirrors server.ts's requiresClientEmail fallback messaging).
    return { success: true, error: `Registered, but admin notification failed: ${emailError.message}` };
  }

  if (emailData && emailData.emailSent === false) {
    // The Edge Function itself always returns HTTP 200 (so `emailError`
    // above is never set for this case) even when Resend fails internally —
    // check its own reported emailSent field too, or a real send failure
    // here would be invisible to the caller.
    return { success: true, error: `Registered, but the admin notification email couldn't be sent${emailData.error ? `: ${emailData.error}` : "."}` };
  }

  return { success: true };
}

export interface SignInInput {
  username: string;
  password: string;
}

export interface SignInResult extends ServiceResult {
  isApproved?: boolean;
  profile?: {
    fullName: string;
    email: string;
    phone: string;
    affiliation: string;
    authenticId: string;
  };
}

/** Logs in by username (resolved to an email via the email_for_username RPC — see supabase/schema.sql), then checks the admin-approval gate exactly as /api/verify-and-sync-profile did. */
export async function signIn(input: SignInInput): Promise<SignInResult> {
  const supabase = getSupabaseClient();

  const { data: email, error: lookupError } = await supabase.rpc("email_for_username", {
    lookup_username: input.username,
  });

  if (lookupError || !email) {
    return { success: false, error: "No scholar found with that username." };
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (signInError) {
    return { success: false, error: "Incorrect password credentials." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, phone, affiliation, authentic_id, is_approved")
    .eq("id", signInData.user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Scholar profile not found." };
  }

  if (!profile.is_approved) {
    return { success: false, isApproved: false, error: "Awaiting Admin Approval" };
  }

  return {
    success: true,
    isApproved: true,
    profile: {
      fullName: profile.full_name,
      email,
      phone: profile.phone,
      affiliation: profile.affiliation,
      authenticId: profile.authentic_id,
    },
  };
}

/** Pre-login approval check (server.ts's /api/check-approval) via the is_username_approved RPC — no session required. */
export async function checkApproval(username: string): Promise<{ isApproved: boolean }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("is_username_approved", { lookup_username: username });
  if (error) {
    return { isApproved: false };
  }
  return { isApproved: Boolean(data) };
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
export async function sendPasswordResetEmail(email: string): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) {
    return { success: false, error: error.message };
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
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Registers a callback for Supabase's PASSWORD_RECOVERY auth event, which
 * fires once when the client parses a recovery-type session from the URL
 * fragment on page load (i.e. the user just clicked the link from
 * sendPasswordResetEmail's email). Returns an unsubscribe function.
 */
export function onPasswordRecovery(callback: () => void): () => void {
  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      callback();
    }
  });
  return () => subscription.unsubscribe();
}

export interface RequestProfileUpdateInput {
  username: string;
  pendingEmail?: string;
  pendingPhone?: string;
  pendingFullName?: string;
  pendingAffiliation?: string;
  pendingAuthenticId?: string;
  pendingIdDocumentName?: string;
}

/** Stateless, matching server.ts's current behavior exactly — this Edge Function only sends the admin/user notification emails, same as /api/request-profile-update did; it does not persist or apply the change itself. */
export async function requestProfileUpdate(input: RequestProfileUpdateInput): Promise<ServiceResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("request-profile-update", { body: input });
  if (error) {
    return { success: false, error: error.message };
  }
  if (data && data.emailSent === false) {
    return { success: true, error: `Update request created, but the admin notification email couldn't be sent${data.error ? `: ${data.error}` : "."}` };
  }
  return { success: true };
}
