/**
 * Client for the AI Access and admin routes
 * (server/routes/aiAccess.ts, server/routes/admin.ts).
 *
 * Same authed-fetch shape as src/desk/api.ts — duplicated rather than
 * imported because api.ts's helpers are module-private, and this is a
 * separate route family (/api/ai-access, /api/admin/ai) with its own
 * response shapes.
 */

import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import { buildKeyring } from "../ai/keyring";
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
    const rawHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
      ...(await authHeaders()),
    };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (typeof v === "string") {
        const cleanVal = v.replace(/[^\x20-\x7E]/g, "").trim();
        if (cleanVal) headers[k] = cleanVal;
      }
    }

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
  connections: Array<{ provider_id: string; tier: "local" | "byok"; status: string; models_detected: number | null }>;
}

export const getAiAccessStatus = () => api<AiAccessStatus>("/api/ai-access/status");

export const addConnection = (providerId: string, tier: "local" | "byok", modelsDetected?: number) =>
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

export type RoutingTier = "local" | "byok";
export type RoutingTaskType = "simple" | "multimodal" | "reasoning" | "coding" | "long-context" | "literatureDiscovery";

export interface RoutingChoice {
  tier: RoutingTier;
  providerId: string;
  modelId?: string;
  /** Human-readable, safe to show directly; never contains a credential. */
  reasoning: string;
}

export type RoutingDecision = { ok: true; choice: RoutingChoice; fallbacks: RoutingChoice[] } | { ok: false; reasoning: string };

/**
 * Which connection will answer first and which follow it, from this device's
 * own keyring (the same list sent with every AI request, in the same order:
 * own keys, then the local model). Nothing is executed.
 */
export async function routeDecision(_taskType?: RoutingTaskType): Promise<RoutingDecision> {
  const ring = await buildKeyring();
  const choices = ring.map<RoutingChoice>((e) => {
    const local = e.provider === "ollama" || e.provider === "lmstudio";
    return {
      tier: local ? "local" : "byok",
      providerId: e.provider,
      modelId: e.model,
      reasoning: local ? `Using your local ${e.provider}. Nothing leaves your device.` : `Using your own ${e.provider} key.`,
    };
  });
  if (!choices.length) return { ok: false, reasoning: "No AI source is available. Connect a provider in AI Access to continue." };
  return { ok: true, choice: choices[0], fallbacks: choices.slice(1) };
}

// ── Admin ───────────────────────────────────────────────────────────────

/** Mirrors server/src/middleware/requireAdmin.ts's SCOPES — kept in sync by hand, same pattern as RoutingTier above. */
export const SCOPES = ["manage_opportunities", "manage_users", "manage_admins"] as const;
export type Scope = (typeof SCOPES)[number];

export interface AdminWhoAmI {
  isAdmin: boolean;
  isMainAdmin: boolean;
  scopes: Scope[];
}
/** Never throws: a non-admin (or a logged-out caller) gets {isAdmin:false, ...} rather than a rejected promise, since "am I an admin" is a status check, not an action that can fail. */
export const getAdminWhoAmI = (): Promise<AdminWhoAmI> =>
  api<AdminWhoAmI>("/api/admin/ai/whoami").catch(() => ({ isAdmin: false, isMainAdmin: false, scopes: [] }));


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
