/**
 * ADMIN AI ROUTER — the platform's own AI infrastructure.
 *
 * The second of two deliberately separate routing systems. Where userRouter.ts
 * routes over what a USER configured for themselves, this routes over what the
 * ADMINISTRATOR assembled for the platform: local models, free services,
 * free-tier APIs, and paid/BYOK credentials the platform owns — aggregated
 * into one pool of AI *resources*.
 *
 * A resource is a (provider, model) pairing with its own access type, cost,
 * capabilities and availability. Thinking in resources rather than providers
 * is what makes Premium provider-agnostic: a plan grants the RESOURCE, and the
 * resource's `label` is what a subscriber sees. Re-point a resource from
 * Provider A to Provider B and every subscriber keeps the same capability
 * under the same name, with nothing to reconfigure.
 *
 * WHAT THIS DOES NOT DO. It never reads user_ai_connections, never sees which
 * providers a user configured, and never routes a user's own BYOK request. A
 * request only reaches this router when the user's own router selected the
 * Premium capability — at which point the platform is paying, which is the
 * one case where the platform's infrastructure is legitimately involved.
 *
 * The pure ranking function in omniRouter.ts is shared with the user router as
 * a primitive. It holds no data access and no policy about who may use what;
 * the candidate pools, the credentials, and the owners are entirely separate.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import { getEntitlement, isEntitlementActive } from "./entitlements";

export type ResourceAccessType = "local" | "free" | "paid" | "byok";

export interface AiResourceRow extends Record<string, unknown> {
  id: string;
  label: string;
  description: string | null;
  provider_id: string;
  model_id: string | null;
  access_type: ResourceAccessType;
  capabilities: string[] | null;
  cost_per_1k_usd: number | null;
  daily_request_limit: number | null;
  enabled: boolean;
  credential_label: string;
}

/** What a subscriber is allowed to know: the capability, never the provider behind it. */
export interface PublicResource {
  id: string;
  label: string;
  description: string | null;
  capabilities: string[];
}

/** What the admin sees and executes against: the full wiring. */
export interface ResolvedResource {
  id: string;
  label: string;
  providerId: string;
  modelId: string | null;
  accessType: ResourceAccessType;
  credentialLabel: string;
  costPer1kUsd: number | null;
}

function resourcesTable() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<AiResourceRow>(config, "ai_resources");
}

function planResourcesTable() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<{ plan_id: string; resource_id: string } & Record<string, unknown>>(config, "plan_resources");
}

/** The whole pool, for the admin's own management screens. */
export async function listResources(): Promise<AiResourceRow[]> {
  return resourcesTable().select("order=access_type,label");
}

export async function createResource(input: Partial<AiResourceRow>): Promise<void> {
  await resourcesTable().insert({ ...input, updated_at: new Date().toISOString() });
}

export async function updateResource(id: string, patch: Partial<AiResourceRow>): Promise<void> {
  await resourcesTable().update(`id=eq.${encodeURIComponent(id)}`, { ...patch, updated_at: new Date().toISOString() });
}

export async function deleteResource(id: string): Promise<void> {
  await resourcesTable().delete(`id=eq.${encodeURIComponent(id)}`);
}

/** Resource ids granted to a plan. */
export async function resourceIdsForPlan(planId: string): Promise<string[]> {
  const rows = await planResourcesTable().select(`plan_id=eq.${encodeURIComponent(planId)}&select=resource_id`);
  return rows.map((r) => r.resource_id);
}

/**
 * Set a plan's grants to exactly `resourceIds`.
 *
 * Differential, NOT delete-then-insert. The previous version deleted every row
 * for the plan and then inserted the new set as two separate PostgREST calls,
 * which are not one transaction: if the insert failed — a dropped connection,
 * a resource deleted between the two calls — the plan was left with NO
 * resources at all. Since a plan with no grants grants nothing, that silently
 * turned Premium off for every subscriber on it, from an edit that appeared to
 * fail harmlessly.
 *
 * Adding first and removing second also means the intermediate state is a
 * superset rather than an empty set, so a request racing this edit still
 * resolves a resource.
 */
export async function setPlanResources(planId: string, resourceIds: string[]): Promise<void> {
  const table = planResourcesTable();
  const wanted = new Set(resourceIds);
  const current = new Set(await resourceIdsForPlan(planId));

  const toAdd = [...wanted].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    await table.insert(toAdd.map((resource_id) => ({ plan_id: planId, resource_id })));
  }
  if (toRemove.length > 0) {
    // PostgREST `in.(…)` — one call rather than one per row, and scoped to
    // this plan so it can never touch another's grants.
    const list = toRemove.map((id) => encodeURIComponent(id)).join(",");
    await table.delete(`plan_id=eq.${encodeURIComponent(planId)}&resource_id=in.(${list})`);
  }
}

/**
 * The resources a plan actually grants, enabled ones only, ordered cheapest
 * first so the platform spends its own money in the sensible order.
 *
 * A plan with no grants returns nothing. That is deliberate: a newly created
 * plan must not silently inherit access to every resource the admin owns.
 */
export async function resourcesForPlan(planId: string | null): Promise<AiResourceRow[]> {
  if (!planId) return [];
  const ids = await resourceIdsForPlan(planId);
  if (ids.length === 0) return [];

  const all = await listResources();
  const granted = new Set(ids);
  return all
    .filter((r) => granted.has(r.id) && r.enabled)
    .sort((a, b) => {
      // Free-to-the-platform capacity first (local, then free), then cheapest
      // paid. Cost is the admin's, so this is the admin's ordering policy —
      // nothing here depends on which user is asking.
      const rank: Record<ResourceAccessType, number> = { local: 0, free: 1, paid: 2, byok: 2 };
      const byAccess = rank[a.access_type] - rank[b.access_type];
      if (byAccess !== 0) return byAccess;
      return (a.cost_per_1k_usd ?? 0) - (b.cost_per_1k_usd ?? 0);
    });
}

/**
 * What a subscriber may be told about their Premium entitlement.
 *
 * Returns labels and capabilities ONLY. provider_id, model_id, cost and
 * credential_label are stripped here rather than at the route, so no caller
 * can accidentally forward them — the provider-agnostic promise is enforced
 * at the boundary of this module.
 */
export function toPublicResources(rows: AiResourceRow[]): PublicResource[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    capabilities: r.capabilities ?? [],
  }));
}

/**
 * Resolve the ordered concrete resources to attempt for one user's Premium
 * request, matched against the task where the admin tagged capabilities.
 *
 * Re-checks the entitlement server-side rather than trusting that the user
 * router already did: this is the function that spends the platform's money,
 * so it verifies for itself.
 */
export async function resolvePremiumResources(userId: string, taskType?: string): Promise<ResolvedResource[]> {
  const entitlement = await getEntitlement(userId);
  if (!isEntitlementActive(entitlement) || !entitlement) return [];

  const granted = await resourcesForPlan(entitlement.planId);

  // Capability tags are a filter only when the admin actually set them and at
  // least one resource matches; a pool where nobody tagged anything must not
  // resolve to "no resource available".
  const matching = taskType ? granted.filter((r) => (r.capabilities ?? []).includes(taskType)) : [];
  const chosen = matching.length > 0 ? matching : granted;

  return chosen.map((r) => ({
    id: r.id,
    label: r.label,
    providerId: r.provider_id,
    modelId: r.model_id,
    accessType: r.access_type,
    credentialLabel: r.credential_label,
    costPer1kUsd: r.cost_per_1k_usd,
  }));
}

/** Public view of a user's own Premium entitlement, for the AI Access page. */
export async function premiumCatalogueForUser(userId: string): Promise<{ active: boolean; planId: string | null; resources: PublicResource[] }> {
  const entitlement = await getEntitlement(userId);
  if (!isEntitlementActive(entitlement) || !entitlement) {
    return { active: false, planId: null, resources: [] };
  }
  const granted = await resourcesForPlan(entitlement.planId);
  return { active: true, planId: entitlement.planId, resources: toPublicResources(granted) };
}
