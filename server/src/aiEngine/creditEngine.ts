/**
 * Credit Engine — Section 12. Thin wrapper around the atomic
 * deduct_credits/grant_credits Postgres functions (supabase/schema_ai_engine.sql)
 * — see that file's comment for why the atomicity has to live in the
 * database rather than in this TypeScript layer.
 */

import { getSupabaseRestConfig } from "../supabaseRest";

export type DeductResult = "ok" | "daily_limit_exceeded" | "weekly_limit_exceeded" | "monthly_limit_exceeded" | "insufficient_balance";

async function rpc(config: NonNullable<ReturnType<typeof getSupabaseRestConfig>>, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`rpc/${fn} ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

/** PostgREST's "no function matches these argument names" response — the shape it returns when p_weekly_limit isn't a parameter this database's deduct_credits has yet. */
function isUnknownRpcSignatureError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("rpc/deduct_credits 404") || message.includes("PGRST202") || message.includes("Could not find the function");
}

export async function deductCredits(
  userId: string,
  amount: number,
  dailyLimit: number | null,
  monthlyLimit: number | null,
  reason: "usage",
  requestId: string,
  note?: string,
  weeklyLimit?: number | null
): Promise<DeductResult> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const baseArgs = {
    p_user_id: userId,
    p_amount: amount,
    p_daily_limit: dailyLimit,
    p_monthly_limit: monthlyLimit,
    p_reason: reason,
    p_request_id: requestId,
    p_note: note ?? null,
  };
  try {
    const result = await rpc(config, "deduct_credits", { ...baseArgs, p_weekly_limit: weeklyLimit ?? null });
    return result as DeductResult;
  } catch (err) {
    // The schema_ai_engine.sql migration adding p_weekly_limit may not be
    // applied to this database yet (it's appended, idempotent, but still a
    // manual step — see that file's own comment). Retrying without it
    // means a not-yet-migrated database keeps working exactly as it did
    // before this parameter existed, rather than every Premium generation
    // failing outright until someone runs the migration.
    if (!isUnknownRpcSignatureError(err)) throw err;
    const result = await rpc(config, "deduct_credits", baseArgs);
    return result as DeductResult;
  }
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: "admin_grant" | "bonus" | "refund" | "plan_allocation",
  note?: string
): Promise<void> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  await rpc(config, "grant_credits", { p_user_id: userId, p_amount: amount, p_reason: reason, p_note: note ?? null });
}
