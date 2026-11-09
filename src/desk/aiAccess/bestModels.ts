/**
 * "Best models only" for AI Access: the provider's live model list, reduced
 * by the router's curation rules (text models, stable aliases, no stale
 * previews, newest generation per family and tier, at most four) and given
 * only badges with evidence. The same rules decide what the server lists at
 * /api/ai/models, so both places agree.
 */
import { assignBadges, curateModels, type CuratedModel } from "../../platform/router/modelCuration";
import type { ModelSpec } from "../../config/modelCatalog";
import type { DiscoveredModel } from "../../services/modelDiscovery";

const ROUTER_PROVIDER: Record<string, string> = { gemini: "google" };

export function bestDiscovered(providerId: string, discovered: DiscoveredModel[], now = Date.now()): CuratedModel[] {
  // Only models the provider itself listed: a built-in fallback list is never "best".
  const live = discovered.filter((d) => d.source === "live_discovery").map((d) => ({
    id: d.modelId || d.id,
    displayName: d.displayName,
    contextWindow: d.contextWindow || undefined,
    supportsVision: d.inputModalities?.includes("image"),
    supportsTools: d.capabilities.includes("toolCalling"),
  }));
  return assignBadges(curateModels(ROUTER_PROVIDER[providerId] ?? providerId, live, { now }));
}

/** A curated model as a picker option; its badges are part of the label. */
export function curatedToSpec(providerId: string, m: CuratedModel, accessModes: ModelSpec["accessModes"]): ModelSpec {
  const badges = m.badges.map((b) => b.label).join(", ");
  return {
    id: `${providerId}:${m.id}`,
    providerId,
    modelId: m.id,
    displayName: `${m.displayName || m.id}${badges ? ` — ${badges}` : ""}`,
    status: "current",
    accessModes,
    capabilities: [],
    contextWindow: m.contextWindow ?? null,
    inputModalities: m.supportsVision ? ["text", "image"] : ["text"],
    outputModalities: ["text"],
    relativeQuality: m.tier,
    relativeSpeed: m.tier === "fast" ? "fast" : "moderate",
    pricing: null,
    lastVerified: new Date().toISOString().slice(0, 10),
    verified: true,
    notes: "Listed live by the provider for this account",
  };
}
