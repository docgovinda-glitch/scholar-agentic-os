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
  /**
   * Admin's explicit opt-in for spending Scholar's own credential on this
   * provider for Premium users. Optional on the type because a database that
   * has not yet had the PREMIUM CATALOGUE migration applied simply will not
   * return the column — see the `select=*` note below.
   */
  premium_enabled?: boolean;
  premium_models?: string[] | null;
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
    // No explicit column list: premium_enabled/premium_models come from the
    // PREMIUM CATALOGUE migration, and naming a column PostgREST does not have
    // yet is a hard 400 that would take down routing entirely on an
    // unmigrated database. `*` returns whatever exists, and the
    // `premiumEligible` check below treats an absent column as "not enabled" —
    // the same fail-closed pattern requireAdmin.ts uses for admin_users.scopes.
    providers.select(),
  ]);

  const healthByProvider = new Map(healthRows.map((h) => [h.provider_id, h.status]));
  const defaultModelByProvider = new Map(providerRows.map((p) => [p.id, p.metadata?.defaultModel ?? ""]));
  const premiumEligible = new Set(providerRows.filter((p) => p.premium_enabled === true).map((p) => p.id));
  const premiumModelsByProvider = new Map(providerRows.map((p) => [p.id, p.premium_models ?? []]));
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
      // Holding a credential is NOT the same as authorising Premium spend on
      // it. Before this check, an admin storing a key merely to test a
      // provider made it live for every subscriber immediately. The admin now
      // opts in per provider (ai_providers.premium_enabled), and this is where
      // that decision is enforced — server-side, in the routing layer both the
      // preview and real execution share, so it cannot be bypassed from the
      // client.
      if (!premiumEligible.has(cred.provider_id)) continue;
      candidates.push({
        tier: "premium",
        providerId: cred.provider_id,
        eligible: true,
        health: healthByProvider.get(cred.provider_id) ?? "unknown",
        // When the admin has narrowed Premium to specific models, the first
        // is the one to run; empty means "use the provider's catalogue
        // default", which is the behaviour that existed before.
        modelId: premiumModelsByProvider.get(cred.provider_id)?.[0],
      });
    }
  }

  return { candidates, premiumQuotaRemaining, entitlement, entitlementActive, quota, defaultModelByProvider };
}

/**
 * What a Premium subscriber may actually use, for display in AI Access.
 *
 * Returns only providers that are BOTH admin-opted-in and backed by a live
 * credential, so the list can never advertise something a request would then
 * be refused for. Names and model ids only — the credential itself never
 * leaves the server.
 */
export async function getPremiumCatalogue(): Promise<Array<{ providerId: string; name: string; models: string[] }>> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const providers = new SupabaseTable<ProviderRow & { name?: string }>(config, "ai_providers");
  const platformCredentials = new SupabaseTable<PlatformCredentialRow>(config, "platform_provider_credentials");

  const [providerRows, creds] = await Promise.all([
    providers.select(),
    platformCredentials.select("status=eq.active&select=provider_id,status"),
  ]);

  const withCredential = new Set(creds.map((c) => c.provider_id));
  return providerRows
    .filter((p) => p.premium_enabled === true && withCredential.has(p.id))
    .map((p) => ({
      providerId: p.id,
      name: (p.name as string | undefined) ?? p.id,
      models: p.premium_models ?? [],
    }));
}
