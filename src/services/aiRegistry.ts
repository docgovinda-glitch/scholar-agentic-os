/**
 * Read access to the DB-backed AI provider/model registry
 * (supabase/schema_ai_engine.sql's ai_providers/ai_models).
 *
 * Public SELECT RLS on both tables (anyone can see the catalog, even signed
 * out — needed to render the AI Access page and Setup Guide before sign-in),
 * so this reads directly through the ordinary Supabase client, the same way
 * src/services/userAiSettings.ts reads user_ai_settings. No server route
 * needed for this — writes are the part that requires an admin check, and
 * those go through server/routes/admin.ts.
 *
 * Source of truth for request-shape details (baseUrl, chatPath, apiStyle)
 * stays src/config/providerCatalog.ts / localRunnerCatalog.ts — this module
 * is for the registry's admin-configurable, Premium/Free-eligibility facts
 * (enabled, premium_eligible, free_eligible, last_verified_at) that the
 * static catalogs don't carry.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

export type ProviderCategory = "local" | "free" | "byok" | "premium_pool";

export interface RegistryProvider {
  id: string;
  name: string;
  category: ProviderCategory;
  apiStyle: string;
  baseUrl: string | null;
  docsUrl: string | null;
  freeTierKind: string | null;
  freeTierNote: string | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface RegistryModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  contextWindow: number | null;
  capabilities: Record<string, boolean>;
  modalities: string[];
  speedClass: string | null;
  costClass: string | null;
  premiumEligible: boolean;
  freeEligible: boolean;
  enabled: boolean;
  lastVerifiedAt: string | null;
}

interface ProviderRow {
  id: string;
  name: string;
  category: ProviderCategory;
  api_style: string;
  base_url: string | null;
  docs_url: string | null;
  free_tier_kind: string | null;
  free_tier_note: string | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

interface ModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  context_window: number | null;
  capabilities: Record<string, boolean>;
  modalities: string[];
  speed_class: string | null;
  cost_class: string | null;
  premium_eligible: boolean;
  free_eligible: boolean;
  enabled: boolean;
  last_verified_at: string | null;
}

function toProvider(row: ProviderRow): RegistryProvider {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    apiStyle: row.api_style,
    baseUrl: row.base_url,
    docsUrl: row.docs_url,
    freeTierKind: row.free_tier_kind,
    freeTierNote: row.free_tier_note,
    enabled: row.enabled,
    metadata: row.metadata ?? {},
  };
}

function toModel(row: ModelRow): RegistryModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    contextWindow: row.context_window,
    capabilities: row.capabilities ?? {},
    modalities: row.modalities ?? ["text"],
    speedClass: row.speed_class,
    costClass: row.cost_class,
    premiumEligible: row.premium_eligible,
    freeEligible: row.free_eligible,
    enabled: row.enabled,
    lastVerifiedAt: row.last_verified_at,
  };
}

/** Every enabled provider. Empty (not throwing) when Supabase isn't configured — the registry is a nice-to-have for the setup guide, not a hard dependency. */
export async function listProviders(): Promise<RegistryProvider[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("ai_providers").select("*").eq("enabled", true).order("name");
  if (error || !data) return [];
  return (data as ProviderRow[]).map(toProvider);
}

export async function listModelsForProvider(providerId: string): Promise<RegistryModel[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ai_models")
    .select("*")
    .eq("provider_id", providerId)
    .eq("enabled", true)
    .order("display_name");
  if (error || !data) return [];
  return (data as ModelRow[]).map(toModel);
}
