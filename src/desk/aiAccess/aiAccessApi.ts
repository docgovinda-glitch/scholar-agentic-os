/**
 * Client for the AI Access + Admin AI Infrastructure routes
 * (server/routes/aiAccess.ts, server/routes/admin.ts).
 *
 * Same authed-fetch shape as src/desk/api.ts — duplicated rather than
 * imported because api.ts's helpers are module-private, and this is a
 * separate route family (/api/ai-access, /api/admin/ai) with its own
 * response shapes.
 */

import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import { clientVerifyProviderKey } from "../../services/clientProviderVerifier";

async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ApiOptions extends RequestInit {
  retries?: number;
}

async function api<T>(path: string, init: ApiOptions = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const maxRetries = init.retries ?? (method === "GET" ? 2 : 0);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
      ...(await authHeaders()),
    };

    try {
      const res = await fetch(path, { ...init, headers });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const isRetryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
        if (isRetryable && attempt < maxRetries) {
          const retryAfterHeader = res.headers.get("retry-after");
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const delayMs = !isNaN(retryAfterSec) && retryAfterSec > 0 && retryAfterSec <= 10
            ? retryAfterSec * 1000
            : Math.min(3000, 500 * Math.pow(2, attempt) + Math.random() * 200);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        const rawMessage =
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as { error?: string; message?: string }).error ||
              (body as { error?: string; message?: string }).message
            : undefined;

        let message = rawMessage;
        if (!message) {
          if (res.status === 429) {
            message = "Rate limit reached (429). Please wait a moment.";
          } else {
            message = `Request failed (${res.status})`;
          }
        }
        throw new Error(message);
      }

      return body as T;
    } catch (err) {
      if (attempt < maxRetries && (err as Error).name !== "AbortError") {
        const isNetworkErr = err instanceof TypeError || (err as Error).message.includes("fetch");
        if (isNetworkErr) {
          const delayMs = 500 * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
      }
      throw err;
    }
  }

  throw new Error("Request failed after retries");
}

// ── User-facing AI Access ──────────────────────────────────────────────

export interface AiAccessStatus {
  connections: Array<{ provider_id: string; tier: "local" | "free" | "byok"; status: string; models_detected: number | null }>;
  entitlement: { status: string; active: boolean; planId?: string | null; expiry?: string | null };
  quota: { monthlyCredits: number | null; weeklyCredits: number | null; dailyCredits: number | null; perTaskMaxCredits: number | null; concurrencyLimit: number } | null;
  creditBalance: { balance: number; daily_used: number; weekly_used: number; monthly_used: number } | null;
}

export const getAiAccessStatus = () => api<AiAccessStatus>("/api/ai-access/status");

export const addConnection = (providerId: string, tier: "local" | "free" | "byok", modelsDetected?: number) =>
  api<{ success: true }>("/api/ai-access/connections", { method: "POST", body: JSON.stringify({ providerId, tier, modelsDetected }) });

export const removeConnection = (providerId: string) =>
  api<{ success: true }>(`/api/ai-access/connections/${encodeURIComponent(providerId)}`, { method: "DELETE" });

export interface VerifyKeyResult {
  ok: boolean;
  modelsDetected?: number;
  error?: string;
  deferred?: boolean;
  note?: string;
}

/** User BYOK keys are verified directly in the browser. They reach the Scholar server only as a per-request header on AI routes (see routeUsesClientAi in desk/api/client.ts). */
export const verifyProviderKey = (providerId: string, apiKey: string, baseUrlOverride?: string): Promise<VerifyKeyResult> =>
  clientVerifyProviderKey(providerId, apiKey, baseUrlOverride);

export interface PublicResource {
  id: string;
  label: string;
  description: string | null;
  capabilities: string[];
}

export interface PremiumCatalog {
  active: boolean;
  planId: string | null;
  /**
   * Resource LABELS and capabilities only. Deliberately no provider or model:
   * the admin router strips those before they leave the server, so an admin
   * can re-point a Premium capability at a different provider without a
   * subscriber seeing any change.
   */
  resources: PublicResource[];
}

export const getPremiumCatalog = () => api<PremiumCatalog>("/api/ai-access/premium-catalog");

export interface OfferedPlan {
  id: string;
  name: string;
  description: string | null;
  monthlyCredits: number | null;
  weeklyCredits: number | null;
  dailyCredits: number | null;
  perTaskMaxCredits: number | null;
  concurrencyLimit: number;
}
/** Plans a user may ask for. Admin-only plans are never listed. */
export const getOfferedPlans = () => api<OfferedPlan[]>("/api/ai-access/premium-plans");

export interface MyPremiumRequest {
  id: string;
  requested_plan_id: string | null;
  note: string | null;
  status: "pending" | "approved" | "declined" | "withdrawn";
  created_at: string;
  decision_note: string | null;
}
export const getMyPremiumRequest = () => api<MyPremiumRequest | null>("/api/ai-access/premium-request");
export const requestPremium = (planId?: string, note?: string) =>
  api<{ success: true }>("/api/ai-access/premium-request", { method: "POST", body: JSON.stringify({ planId, note }) });
export const withdrawPremiumRequest = () =>
  api<{ success: true }>("/api/ai-access/premium-request", { method: "DELETE" });

/** Mirrors server/src/aiEngine/omniRouter.ts's Tier/TaskType — duplicated rather than imported since that module lives server-side only. */
export type RoutingTier = "local" | "free" | "byok" | "premium";
export type RoutingTaskType = "simple" | "multimodal" | "reasoning" | "coding" | "long-context" | "literatureDiscovery";

export interface RoutingChoice {
  tier: RoutingTier;
  providerId: string;
  modelId?: string;
  /** Human-readable, safe to show directly — never contains a credential. */
  reasoning: string;
}

export type RoutingDecision = { ok: true; choice: RoutingChoice; fallbacks: RoutingChoice[] } | { ok: false; reasoning: string };

/**
 * Preview of the Scholar AI Engine's pick for a task, WITHOUT executing
 * anything — the same `assembleRoutingCandidates` + `selectProvider` the
 * server uses for real generation (server/src/aiEngine/routingCandidates.ts,
 * omniRouter.ts), so a caller showing "Why this AI?" is always describing
 * the actual decision, not a separately-computed guess.
 */
export const routeDecision = (taskType: RoutingTaskType, privacyPreference?: "no-cloud" | "any") =>
  api<RoutingDecision>("/api/ai-access/route", { method: "POST", body: JSON.stringify({ taskType, privacyPreference }) });

// ── Admin ───────────────────────────────────────────────────────────────

/** Mirrors server/src/middleware/requireAdmin.ts's SCOPES — kept in sync by hand, same pattern as RoutingTier above. */
export const SCOPES = ["manage_providers", "manage_premium", "manage_budget", "manage_opportunities", "manage_users", "manage_admins"] as const;
export type Scope = (typeof SCOPES)[number];

export interface AdminWhoAmI {
  isAdmin: boolean;
  isMainAdmin: boolean;
  scopes: Scope[];
}
/** Never throws: a non-admin (or a logged-out caller) gets {isAdmin:false, ...} rather than a rejected promise, since "am I an admin" is a status check, not an action that can fail. */
export const getAdminWhoAmI = (): Promise<AdminWhoAmI> =>
  api<AdminWhoAmI>("/api/admin/ai/whoami").catch(() => ({ isAdmin: false, isMainAdmin: false, scopes: [] }));

export const getAdminDashboard = () => api<Record<string, unknown>>("/api/admin/ai/dashboard");

export interface AdminRosterEntry {
  userId: string;
  grantedBy: string | null;
  grantedAt: string;
  note: string | null;
  scopes: Scope[];
  username: string | null;
  fullName: string | null;
}
export const getAdmins = () => api<AdminRosterEntry[]>("/api/admin/ai/admins");
export const grantAdminAccess = (userId: string, scopes?: Scope[], note?: string) =>
  api<{ success: true }>("/api/admin/ai/admins", { method: "POST", body: JSON.stringify({ userId, scopes, note }) });
export const revokeAdminAccess = (userId: string) =>
  api<{ success: true }>(`/api/admin/ai/admins/${encodeURIComponent(userId)}`, { method: "DELETE" });
export const setAdminScopes = (userId: string, scopes: Scope[]) =>
  api<{ success: true }>(`/api/admin/ai/admins/${encodeURIComponent(userId)}/scopes`, { method: "PATCH", body: JSON.stringify({ scopes }) });

export interface UserSearchResult {
  userId: string;
  email: string | null;
  username: string | null;
  fullName: string | null;
  accountStatus: string | null;
}
export const searchUsers = (q: string) => api<UserSearchResult[]>(`/api/admin/ai/users/search?q=${encodeURIComponent(q)}`);
export const setUserAccountStatus = (userId: string, status: "active" | "suspended", reason?: string) =>
  api<{ success: true }>(`/api/admin/ai/users/${encodeURIComponent(userId)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
/** confirmEmail must match the account's actual current email — checked again server-side, never trusted from the client alone. Irreversible. */
export const deleteUserPermanently = (userId: string, confirmEmail: string) =>
  api<{ success: true }>(`/api/admin/ai/users/${encodeURIComponent(userId)}`, { method: "DELETE", body: JSON.stringify({ confirmEmail }) });

export interface QuotaOverride {
  user_id: string;
  monthly_credits: number | null;
  weekly_credits: number | null;
  daily_credits: number | null;
  per_task_max_credits: number | null;
  concurrency_limit: number | null;
  reason: string | null;
}
export const getQuotaOverride = (userId: string) => api<QuotaOverride | null>(`/api/admin/ai/quota-overrides/${encodeURIComponent(userId)}`);
export const setQuotaOverride = (override: {
  userId: string;
  monthlyCredits?: number | null;
  weeklyCredits?: number | null;
  dailyCredits?: number | null;
  perTaskMaxCredits?: number | null;
  concurrencyLimit?: number | null;
  reason?: string;
}) => api<{ success: true }>("/api/admin/ai/quota-overrides", { method: "POST", body: JSON.stringify(override) });

export interface AdminProvider {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  free_tier_kind: string | null;
}
export const getAdminProviders = () => api<AdminProvider[]>("/api/admin/ai/providers");
export const setProviderEnabled = (id: string, enabled: boolean) =>
  api<{ success: true }>(`/api/admin/ai/providers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
export interface PremiumSubscriber {
  userId: string;
  planId: string | null;
  startDate: string | null;
  expiry: string | null;
  currentlyActive: boolean;
  /** Within 14 days of expiry — worth renewing before it lapses. */
  expiringSoon?: boolean;
  username: string | null;
  fullName: string | null;
  accountStatus: string | null;
}
export const getPremiumSubscribers = () => api<PremiumSubscriber[]>("/api/admin/ai/premium-subscribers");

export interface PremiumPlan {
  id: string;
  name: string;
  monthly_credits: number;
  weekly_credits: number | null;
  daily_credits: number | null;
  per_task_max_credits: number | null;
  concurrency_limit: number;
  enabled: boolean;
}
export const getPremiumPlans = () => api<PremiumPlan[]>("/api/admin/ai/premium-plans");
export const upsertPremiumPlan = (plan: PremiumPlan) =>
  api<{ success: true }>("/api/admin/ai/premium-plans", { method: "POST", body: JSON.stringify(plan) });

export const grantPremiumTo = (userId: string, planId: string, expiry: string | null) =>
  api<{ success: true }>("/api/admin/ai/entitlements/grant", { method: "POST", body: JSON.stringify({ userId, planId, expiry }) });
export const revokePremiumFrom = (userId: string) =>
  api<{ success: true }>("/api/admin/ai/entitlements/revoke", { method: "POST", body: JSON.stringify({ userId }) });

export const grantCreditsTo = (userId: string, amount: number, note?: string) =>
  api<{ success: true }>("/api/admin/ai/credits/grant", { method: "POST", body: JSON.stringify({ userId, amount, note }) });

/**
 * Aggregate usage only. There is deliberately no per-request, per-user row
 * here: an admin may see what the platform spends in total and what each
 * subscriber owes, never what an individual asked for or when.
 */
export interface UsageSummary {
  totalRequests: number;
  totalCredits: number;
  byResource: Array<{ providerId: string; modelId: string | null; requests: number; credits: number; errors: number }>;
  billing: Array<{ userId: string; credits: number }>;
}
export const getUsage = () => api<UsageSummary>("/api/admin/ai/usage");

// ── Admin AI Router: resource pool ─────────────────────────────────────

export interface AiResource {
  id: string;
  label: string;
  description: string | null;
  provider_id: string;
  model_id: string | null;
  access_type: "local" | "free" | "paid" | "byok";
  capabilities: string[] | null;
  cost_per_1k_usd: number | null;
  enabled: boolean;
  credential_label: string;
}
export const getResources = () => api<AiResource[]>("/api/admin/ai/resources");
export const createResource = (input: {
  label: string;
  providerId: string;
  modelId?: string;
  accessType: "local" | "free" | "paid" | "byok";
  description?: string;
  capabilities?: string[];
  costPer1kUsd?: number | null;
  credentialLabel?: string;
}) => api<{ success: true }>("/api/admin/ai/resources", { method: "POST", body: JSON.stringify(input) });
export const updateResource = (id: string, patch: Record<string, unknown>) =>
  api<{ success: true }>(`/api/admin/ai/resources/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteResource = (id: string) =>
  api<{ success: true }>(`/api/admin/ai/resources/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getPlanResources = (planId: string) => api<string[]>(`/api/admin/ai/plans/${encodeURIComponent(planId)}/resources`);
export const setPlanResources = (planId: string, resourceIds: string[]) =>
  api<{ success: true }>(`/api/admin/ai/plans/${encodeURIComponent(planId)}/resources`, { method: "PUT", body: JSON.stringify({ resourceIds }) });

export interface PremiumRequestRow {
  id: string;
  userId: string;
  requestedPlanId: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  username: string | null;
  fullName: string | null;
}
export const getPremiumRequests = (status = "pending") =>
  api<PremiumRequestRow[]>(`/api/admin/ai/premium-requests?status=${encodeURIComponent(status)}`);
export const approvePremiumRequest = (id: string, planId: string, expiry?: string | null, note?: string) =>
  api<{ success: true }>(`/api/admin/ai/premium-requests/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify({ planId, expiry: expiry ?? null, note }),
  });
export const declinePremiumRequest = (id: string, note?: string) =>
  api<{ success: true }>(`/api/admin/ai/premium-requests/${encodeURIComponent(id)}/decline`, { method: "POST", body: JSON.stringify({ note }) });

export interface PlatformBudget {
  monthly_budget_usd: number;
  warn_threshold_pct: number;
  prefer_cheap_threshold_pct: number;
  restrict_threshold_pct: number;
  stop_threshold_pct: number;
  current_month_spend_usd: number;
}
export const getBudget = () => api<PlatformBudget | null>("/api/admin/ai/budget");
export const updateBudget = (budget: Partial<PlatformBudget>) =>
  api<{ success: true }>("/api/admin/ai/budget", { method: "PATCH", body: JSON.stringify(budget) });

export interface PlatformCredential {
  id: string;
  providerId: string;
  label: string;
  maskedPreview: string;
  status: string;
  lastVerifiedAt: string | null;
  createdAt: string;
}
export const getPlatformCredentials = () => api<PlatformCredential[]>("/api/admin/ai/platform-credentials");
export const storePlatformCredential = (providerId: string, credential: string, label?: string) =>
  api<{ success: true }>("/api/admin/ai/platform-credentials", { method: "POST", body: JSON.stringify({ providerId, credential, label }) });
export const removePlatformCredential = (id: string) =>
  api<{ success: true }>(`/api/admin/ai/platform-credentials/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface Opportunity {
  id: string;
  provider_name: string;
  opportunity_name: string;
  official_url: string;
  eligibility: string | null;
  value_estimate: string | null;
  multi_user_allowed: string;
  confidence: string;
  risk: string;
  status: string;
  discovered_at: string;
}
export const getOpportunities = (status?: string) => api<Opportunity[]>(`/api/admin/ai/opportunities${status ? `?status=${status}` : ""}`);
export const runOpportunityResearch = (query: string) =>
  api<{ success: true; foundCount: number }>("/api/admin/ai/opportunities/research", { method: "POST", body: JSON.stringify({ query }) });
export const reviewOpportunity = (id: string, decision: "approved" | "rejected" | "ignored", notes?: string) =>
  api<{ success: true }>(`/api/admin/ai/opportunities/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ decision, notes }) });

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}
export const getAuditLog = () => api<AuditLogEntry[]>("/api/admin/ai/audit-log");

// ── AI keys saved to the user's account ──────────────────────────────────
// So the AI set up on one device works on every device the person signs in
// on (server/src/aiEngine/userKeyVault.ts). Each call acts on the signed-in
// user's own keys only.

export interface AccountKeySummary {
  providerId: string;
  maskedPreview: string;
  updatedAt: string;
}
export interface AccountKey {
  providerId: string;
  apiKey: string;
  updatedAt: string;
}

export const listAccountKeys = () => api<{ keys: AccountKeySummary[] }>("/api/ai-access/keys", { cache: "no-store" });
export const pullAccountKeys = () => api<{ keys: AccountKey[] }>("/api/ai-access/keys/sync", { cache: "no-store", retries: 0 });
export const saveAccountKey = (providerId: string, key: string) =>
  api<AccountKeySummary>(`/api/ai-access/keys/${encodeURIComponent(providerId)}`, { method: "PUT", body: JSON.stringify({ key }), cache: "no-store" });
export const deleteAccountKey = (providerId: string) =>
  api<{ success: true }>(`/api/ai-access/keys/${encodeURIComponent(providerId)}`, { method: "DELETE" });
