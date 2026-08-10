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

async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined), ...(await authHeaders()) };
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

// ── User-facing AI Access ──────────────────────────────────────────────

export interface AiAccessStatus {
  connections: Array<{ provider_id: string; tier: "local" | "free" | "byok"; status: string; models_detected: number | null }>;
  entitlement: { status: string; active: boolean; planId?: string | null; expiry?: string | null };
  quota: { monthlyCredits: number | null; dailyCredits: number | null; perTaskMaxCredits: number | null; concurrencyLimit: number } | null;
  creditBalance: { balance: number; daily_used: number; monthly_used: number } | null;
}

export const getAiAccessStatus = () => api<AiAccessStatus>("/api/ai-access/status");

export const addConnection = (providerId: string, tier: "local" | "free" | "byok", modelsDetected?: number) =>
  api<{ success: true }>("/api/ai-access/connections", { method: "POST", body: JSON.stringify({ providerId, tier, modelsDetected }) });

export const removeConnection = (providerId: string) =>
  api<{ success: true }>(`/api/ai-access/connections/${encodeURIComponent(providerId)}`, { method: "DELETE" });

// ── Admin ───────────────────────────────────────────────────────────────

export const checkIsAdmin = (): Promise<boolean> =>
  api<{ isAdmin: boolean }>("/api/admin/ai/whoami")
    .then(() => true)
    .catch(() => false);

export const getAdminDashboard = () => api<Record<string, unknown>>("/api/admin/ai/dashboard");

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

export interface PremiumPlan {
  id: string;
  name: string;
  monthly_credits: number;
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

export interface UsageRow {
  id: string;
  user_id: string;
  provider_id: string | null;
  tier: string;
  scholar_credits_charged: number | null;
  status: string;
  created_at: string;
}
export const getUsage = () => api<UsageRow[]>("/api/admin/ai/usage");

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
