/**
 * USER AI ROUTER — every user's own private routing layer.
 *
 * One of two deliberately separate routing systems. This one sees ONLY what a
 * user configured for themselves: their local runners, their free-tier
 * accounts, their BYOK keys. It never reads the admin resource pool, never
 * touches a platform credential, and produces nothing an administrator is
 * shown.
 *
 * Always in the path, even for a single provider. A user with only Ollama
 * still goes User -> User AI Router -> Ollama rather than calling the runner
 * directly, so that adding a second provider later changes configuration
 * only, never the execution path. `routeForUser` therefore returns a decision
 * for a one-candidate set exactly as it does for four.
 *
 * PREMIUM IS OPAQUE HERE, ON PURPOSE. When a user is entitled, this router
 * gets ONE candidate with the synthetic id `premium` — not the providers
 * behind it. Which real provider and model serve a Premium request is decided
 * afterwards by the admin router (adminRouter.ts), from the admin's resource
 * pool. That is what lets an administrator move a Premium capability from one
 * provider to another without a subscriber noticing or reconfiguring
 * anything, and it means the user's own router never learns what the platform
 * runs underneath.
 *
 * The pure ranking function in omniRouter.ts is shared with the admin router.
 * That is a shared primitive, not a shared system: it holds no data access
 * and no policy about who may use what. The two routers assemble entirely
 * separate candidate pools and answer to entirely separate owners.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import { getEntitlement, isEntitlementActive, type Entitlement } from "./entitlements";
import { getEffectiveQuota, type QuotaLimits } from "./quotaEngine";
import { selectProvider, type RoutingCandidate, type RoutingContext, type RoutingDecision } from "./omniRouter";

/** The provider id standing in for "whatever the platform decides", never a real provider. */
export const PREMIUM_PSEUDO_PROVIDER = "premium";

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

export interface UserRoutingState {
  /** The user's own providers, plus the opaque Premium candidate when entitled. */
  candidates: RoutingCandidate[];
  premiumQuotaRemaining: number | null;
  entitlement: Entitlement | null;
  entitlementActive: boolean;
  quota: QuotaLimits | null;
}

/**
 * Everything the user's own router needs, read from the user's own rows.
 *
 * Scoped to `userId` on every query — this function is the only place user
 * connections are read for routing, and it cannot be asked for anyone else's.
 */
export async function assembleUserCandidates(userId: string): Promise<UserRoutingState> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const connections = new SupabaseTable<ConnectionRow>(config, "user_ai_connections");
  const health = new SupabaseTable<HealthRow>(config, "provider_health");
  const balances = new SupabaseTable<CreditBalanceRow>(config, "credit_balances");

  const [connectionRows, entitlement, healthRows] = await Promise.all([
    connections.select(`user_id=eq.${encodeURIComponent(userId)}&status=eq.connected`),
    getEntitlement(userId),
    // Provider health is platform-wide operational data (is this provider up
    // right now), not anything about a particular user.
    health.select("select=provider_id,status"),
  ]);

  const healthByProvider = new Map(healthRows.map((h) => [h.provider_id, h.status]));
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
    const balance = await balances.selectOne(`user_id=eq.${encodeURIComponent(userId)}`);
    premiumQuotaRemaining = balance?.balance ?? 0;
    quota = await getEffectiveQuota(userId, entitlement.planId);

    // Exactly one candidate, whatever the admin has in the pool behind it.
    // Health is "unknown" because the health of the platform's own providers
    // is not the user's business and would leak which provider is in use.
    candidates.push({
      tier: "premium",
      providerId: PREMIUM_PSEUDO_PROVIDER,
      eligible: true,
      health: "unknown",
    });
  }

  return { candidates, premiumQuotaRemaining, entitlement, entitlementActive, quota };
}

/**
 * The user's routing decision. Runs for one configured provider exactly as it
 * does for many — the router is a standard part of the path, not something
 * that switches on only when there is a choice to make.
 */
export async function routeForUser(userId: string, context: Omit<RoutingContext, "premiumQuotaRemaining">): Promise<RoutingDecision> {
  const state = await assembleUserCandidates(userId);
  return selectProvider(state.candidates, { ...context, premiumQuotaRemaining: state.premiumQuotaRemaining });
}

/** True when a decision selected the platform's Premium capability rather than one of the user's own providers. */
export function isPremiumChoice(providerId: string): boolean {
  return providerId === PREMIUM_PSEUDO_PROVIDER;
}
