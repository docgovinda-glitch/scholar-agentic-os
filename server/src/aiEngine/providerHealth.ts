/**
 * Provider health — Priority 8. Deliberately minimal: no background polling,
 * no scheduled health-check job, no new monitoring infrastructure. This
 * reacts to the outcomes of REAL live requests only, and exists purely so
 * Omni Router's next decision (assembleRoutingCandidates() reads
 * provider_health.status) avoids a provider that just failed, without a
 * human having to notice and disable it by hand.
 *
 * WHAT STAYS PASSIVE (documented per Priority 8's own instruction):
 *   - No periodic/background health checks — status only changes as a
 *     side effect of an actual generation attempt through
 *     server/routes/studio.ts.
 *   - The consecutive-failure counter is in-process (a module-level Map),
 *     not persisted — a server restart resets it to zero even though the
 *     DB's last-written `status` column still shows whatever was last
 *     recorded. A provider marked "down" before a restart is deliberately
 *     given a a fresh chance after one, rather than requiring a manual
 *     admin reset — recovery-by-restart is a reasonable, stated trade-off,
 *     not a deployed self-healing system.
 *   - Nothing here retries a failed request itself; server/routes/studio.ts
 *     decides whether/how to try a fallback candidate. This module only
 *     ever records what already happened.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

const DEGRADED_AFTER = 1;
const DOWN_AFTER = 3;

interface ProviderHealthRow extends Record<string, unknown> {
  provider_id: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latency_ms: number | null;
  last_checked_at: string;
  last_error: string | null;
}

const consecutiveFailures = new Map<string, number>();

function table() {
  const config = getSupabaseRestConfig();
  if (!config) return null;
  return new SupabaseTable<ProviderHealthRow>(config, "provider_health");
}

export async function recordProviderSuccess(providerId: string, latencyMs: number): Promise<void> {
  consecutiveFailures.delete(providerId);
  const t = table();
  if (!t) return;
  await t.upsert({
    provider_id: providerId,
    status: "healthy",
    latency_ms: latencyMs,
    last_checked_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function recordProviderFailure(providerId: string, errorMessage: string): Promise<void> {
  const failures = (consecutiveFailures.get(providerId) ?? 0) + 1;
  consecutiveFailures.set(providerId, failures);

  const status = failures >= DOWN_AFTER ? "down" : failures >= DEGRADED_AFTER ? "degraded" : "healthy";
  const t = table();
  if (!t) return;
  await t.upsert({
    provider_id: providerId,
    status,
    latency_ms: null,
    last_checked_at: new Date().toISOString(),
    last_error: errorMessage.slice(0, 500),
  });
}
