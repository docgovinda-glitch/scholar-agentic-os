/**
 * Assembles the real `RoutingCandidate[]` Omni Router needs, from the
 * user's own connections/entitlement/quota/provider-health — shared by
 * `POST /api/ai-access/route` (decision preview for the AI Access page) and
 * `POST /api/studio/refine`'s server-mediated path (the actual live
 * execution), so the two can never diverge on what "available" means.
 *
 * Omni Router itself (omniRouter.ts) stays pure and knows nothing about any
 * of these tables — this module is the only place that reads them.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import { getEntitlement, isEntitlementActive, type Entitlement } from "./entitlements";
import { getEffectiveQuota, type QuotaLimits } from "./quotaEngine";
import type { RoutingCandidate } from "./omniRouter";

interface ConnectionRow extends Record<string, unknown> {
  provider_id: string;
  tier: "local" | "free" | "byok";
}

interface HealthRow extends Record<string, unknown> {
  provider_id: string;
  status: "healthy" | "degraded" | "down" | "unknown";
}

interface CreditBalanceRow extends Record<string, unknown> {
  balance: number;
}

interface PlatformCredentialRow extends Record<string, unknown> {
  provider_id: string;
  status: "active" | "disabled" | "error";
}

interface ProviderRow extends Record<string, unknown> {
  id: string;
  metadata: { defaultModel?: string } | null;
}

export interface AssembledCandidates {
  candidates: RoutingCandidate[];
  premiumQuotaRemaining: number | null;
  entitlement: Entitlement | null;
  entitlementActive: boolean;
  quota: QuotaLimits | null;
  /** provider_id -> catalog default model, used when a Premium candidate is chosen without a caller-specified model. */
  defaultModelByProvider: Map<string, string>;
}

export async function assembleRoutingCandidates(userId: string): Promise<AssembledCandidates> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const connections = new SupabaseTable<ConnectionRow>(config, "user_ai_connections");
  const health = new SupabaseTable<HealthRow>(config, "provider_health");
  const platformCredentials = new SupabaseTable<PlatformCredentialRow>(config, "platform_provider_credentials");
  const providers = new SupabaseTable<ProviderRow>(config, "ai_providers");
  const balances = new SupabaseTable<CreditBalanceRow>(config, "credit_balances");

  const [connectionRows, entitlement, healthRows, providerRows] = await Promise.all([
    connections.select(`user_id=eq.${encodeURIComponent(userId)}&status=eq.connected`),
    getEntitlement(userId),
    health.select("select=provider_id,status"),
    providers.select("select=id,metadata"),
  ]);

  const healthByProvider = new Map(healthRows.map((h) => [h.provider_id, h.status]));
  const defaultModelByProvider = new Map(providerRows.map((p) => [p.id, p.metadata?.defaultModel ?? ""]));
  const entitlementActive = isEntitlementActive(entitlement);

  const candidates: RoutingCandidate[] = connectionRows.map((c) => ({
    tier: c.tier,
    providerId: c.provider_id,
    eligible: true,
    health: healthByProvider.get(c.provider_id) ?? "unknown",
  }));

  let premiumQuotaRemaining: number | null = null;
  let quota: QuotaLimits | null = null;

  if (entitlementActive && entitlement) {
    const [balance, activePlatformCredentials] = await Promise.all([
      balances.selectOne(`user_id=eq.${encodeURIComponent(userId)}`),
      // Real, admin-configured Premium-pool providers — not a placeholder
      // id. Each one becomes an executable candidate; getDecryptedCredential
      // (credentialVault.ts) looks up by this same provider_id.
      platformCredentials.select("status=eq.active&select=provider_id,status"),
    ]);

    premiumQuotaRemaining = balance?.balance ?? 0;
    quota = await getEffectiveQuota(userId, entitlement.planId);

    for (const cred of activePlatformCredentials) {
      candidates.push({
        tier: "premium",
        providerId: cred.provider_id,
        eligible: true,
        health: healthByProvider.get(cred.provider_id) ?? "unknown",
      });
    }
  }

  return { candidates, premiumQuotaRemaining, entitlement, entitlementActive, quota, defaultModelByProvider };
}
