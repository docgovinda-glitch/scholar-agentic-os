/**
 * Quota Engine — Section 13. Computes the EFFECTIVE limits for a user: a
 * premium_plans row provides the defaults, and a user_quota_overrides row
 * (admin-set) overrides individual fields on top — never wholesale replaces
 * them, so an admin granting one user a higher per-task limit doesn't
 * silently also change their concurrency limit back to unlimited.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

export interface QuotaLimits {
  monthlyCredits: number | null;
  weeklyCredits: number | null;
  dailyCredits: number | null;
  perTaskMaxCredits: number | null;
  concurrencyLimit: number;
}

interface PlanRow extends Record<string, unknown> {
  id: string;
  monthly_credits: number;
  weekly_credits: number | null;
  daily_credits: number | null;
  per_task_max_credits: number | null;
  concurrency_limit: number;
}

interface OverrideRow extends Record<string, unknown> {
  user_id: string;
  monthly_credits: number | null;
  weekly_credits: number | null;
  daily_credits: number | null;
  per_task_max_credits: number | null;
  concurrency_limit: number | null;
}

export async function getEffectiveQuota(userId: string, planId: string | null): Promise<QuotaLimits> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const plans = new SupabaseTable<PlanRow>(config, "premium_plans");
  const overrides = new SupabaseTable<OverrideRow>(config, "user_quota_overrides");

  const [plan, override] = await Promise.all([
    planId ? plans.selectOne(`id=eq.${encodeURIComponent(planId)}`) : Promise.resolve(undefined),
    overrides.selectOne(`user_id=eq.${encodeURIComponent(userId)}`),
  ]);

  return {
    monthlyCredits: override?.monthly_credits ?? plan?.monthly_credits ?? null,
    weeklyCredits: override?.weekly_credits ?? plan?.weekly_credits ?? null,
    dailyCredits: override?.daily_credits ?? plan?.daily_credits ?? null,
    perTaskMaxCredits: override?.per_task_max_credits ?? plan?.per_task_max_credits ?? null,
    concurrencyLimit: override?.concurrency_limit ?? plan?.concurrency_limit ?? 1,
  };
}

/** Pure check against a per-task cap — testable without touching the database. */
export function checkPerTaskLimit(amount: number, limits: QuotaLimits): { allowed: boolean; reason?: string } {
  if (limits.perTaskMaxCredits !== null && amount > limits.perTaskMaxCredits) {
    return { allowed: false, reason: `This task needs ${amount} credits, above the ${limits.perTaskMaxCredits}-credit per-task limit.` };
  }
  return { allowed: true };
}
