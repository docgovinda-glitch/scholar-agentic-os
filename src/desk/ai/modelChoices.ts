/**
 * Model choice, shared by every workspace.
 *
 * The list of models comes from each connected provider's own API
 * (GET /api/ai/models, curated by src/platform/router/modelCuration.ts), so no
 * model name is written here. Recommendations are rules over what the provider
 * reports (tier, context window), never a list of names. Choosing a model
 * updates the one central AI setting that every workspace reads.
 */
import type { CuratedModel } from "../../platform/router/modelCuration";
import { loadUserAiSettings, saveUserAiSettings } from "../../services/userAiSettings";
import { authedFetch, json } from "../api/client";
import { resolveRouterTarget } from "../../platform/router/providerMap";
import { buildKeyring, encodeKeyring, type KeyringEntry } from "./keyring";

export type WorkspaceId = "ask-scholar" | "coursework" | "journal" | "proposal" | "presentation";

export interface ProviderModels {
  provider: string;
  models: CuratedModel[];
  error?: string;
}

/** What each workspace asks of a model, in terms of the provider-reported tiers. */
const WORKSPACE_NEEDS: Record<WorkspaceId, { tiers: Array<CuratedModel["tier"]>; why: string }> = {
  "ask-scholar": { tiers: ["balanced", "fast"], why: "quick, grounded answers in conversation" },
  coursework: { tiers: ["balanced", "flagship"], why: "structured essays with consistent citations" },
  journal: { tiers: ["flagship", "balanced"], why: "long, rigorous manuscript sections" },
  proposal: { tiers: ["flagship", "balanced"], why: "careful argument across a long document" },
  presentation: { tiers: ["fast", "balanced"], why: "short slide copy generated quickly" },
};

/** Ranks models for a workspace: the preferred tier first, then larger context. Pure. */
export function recommendFor(workspace: WorkspaceId, models: CuratedModel[]): { recommended: CuratedModel | undefined; why: string; ranked: CuratedModel[] } {
  const { tiers, why } = WORKSPACE_NEEDS[workspace];
  const rank = (m: CuratedModel) => {
    const t = tiers.indexOf(m.tier);
    return t === -1 ? tiers.length : t;
  };
  const ranked = [...models].sort((a, b) => rank(a) - rank(b) || (b.contextWindow ?? 0) - (a.contextWindow ?? 0));
  const best = ranked[0];
  return { recommended: best && rank(best) < tiers.length ? best : undefined, why, ranked };
}

let cache: { at: number; providers: ProviderModels[] } | null = null;
const CACHE_MS = 10 * 60_000;

/** Live models for every connection on this device. `force` bypasses the 10-minute cache. */
export async function fetchLiveModels(force = false): Promise<ProviderModels[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.providers;
  const res = await authedFetch("/api/ai/models");
  const body = await json<{ providers: ProviderModels[] }>(res);
  cache = { at: Date.now(), providers: body.providers };
  return body.providers;
}

export function clearModelCache(): void {
  cache = null;
}

/** The connection that answers first today (the keyring's first entry). */
export async function activeConnection(): Promise<KeyringEntry | undefined> {
  return (await buildKeyring())[0];
}

/** Makes `model` on the provider (its AI Access catalog id) the model every workspace uses first. */
export async function selectModel(catalogProviderId: string, model: string): Promise<{ ok: boolean; error?: string }> {
  const id = catalogProviderId;
  const settings = await loadUserAiSettings();
  const result = await saveUserAiSettings({ provider: id, preferences: { ...settings.preferences, [`${id}Model`]: model } });
  return result.success ? { ok: true } : { ok: false, error: result.error };
}

/** Models a provider offers for a key the user is about to connect (nothing is saved). */
export async function fetchModelsForKey(catalogProviderId: string, apiKey: string, baseUrl?: string): Promise<{ models: CuratedModel[]; error?: string }> {
  const target = resolveRouterTarget(catalogProviderId, baseUrl);
  if (!target.ok) return { models: [], error: target.reason };
  const entry: KeyringEntry = { provider: target.target.provider, via: target.target.via, model: "auto", apiKey, ...(target.target.baseUrl ? { baseUrl: target.target.baseUrl } : {}) };
  const res = await authedFetch("/api/ai/models", { headers: { "x-ai-keyring": encodeKeyring([entry]) } });
  const body = await json<{ providers: ProviderModels[] }>(res);
  const first = body.providers[0];
  return { models: first?.models ?? [], error: first?.error };
}
