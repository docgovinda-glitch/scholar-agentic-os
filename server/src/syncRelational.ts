import { getSupabaseRestConfig, SupabaseTable } from "./supabaseRest.ts";
import type { Claim, ClaimEvidenceBinding } from "../../src/domain/claim/types.ts";
import type { DiscoveredSource, EvidenceItem } from "../../src/domain/evidence/types.ts";

export async function syncClaimToRelational(projectId: string, claim: Claim) {
  if (process.env.NODE_ENV === "test") return;
  const config = getSupabaseRestConfig();
  if (!config) return;
  const table = new SupabaseTable(config, "project_claims");
  await table.upsert({
    project_id: projectId,
    claim_id: claim.id,
    text: claim.text,
    draft_span_id: claim.draftSpanId,
    status: claim.explicitlyUnsupported ? "unsupported" : "supported",
    unsupported_reason: claim.explicitlyUnsupported?.reason,
    unsupported_actor: claim.explicitlyUnsupported?.markedBy
  }, "project_id,claim_id").catch(e => console.error("syncClaimToRelational failed:", e));
}

export async function syncBindingToRelational(projectId: string, binding: ClaimEvidenceBinding) {
  if (process.env.NODE_ENV === "test") return;
  const config = getSupabaseRestConfig();
  if (!config) return;
  const bindingsTable = new SupabaseTable(config, "project_claim_bindings");
  await bindingsTable.upsert({
    project_id: projectId,
    binding_id: binding.id,
    claim_id: binding.claimId,
    strength: binding.strength,
    rationale: binding.rationale
  }, "project_id,binding_id").catch(e => console.error("syncBindingToRelational failed:", e));
}

export async function syncSourceToRelational(projectId: string, source: DiscoveredSource) {
  if (process.env.NODE_ENV === "test") return;
  const config = getSupabaseRestConfig();
  if (!config) return;
  const table = new SupabaseTable(config, "project_sources");
  await table.upsert({
    project_id: projectId,
    source_id: source.id,
    title: source.title,
    authors: source.authors,
    url: source.url,
    doi: source.doi,
    venue: source.venue,
    year: source.year,
    source_type: source.sourceType,
    authority_tier: source.authorityTier,
    discovered_via: source.discoveredVia,
    discovered_at: source.discoveredAt,
    vault_item_id: source.vaultItemId
  }, "project_id,source_id").catch(e => console.error("syncSourceToRelational failed:", e));
}

export async function syncEvidenceItemToRelational(projectId: string, item: EvidenceItem) {
  if (process.env.NODE_ENV === "test") return;
  const config = getSupabaseRestConfig();
  if (!config) return;
  const table = new SupabaseTable(config, "project_evidence_items");
  await table.upsert({
    project_id: projectId,
    evidence_id: item.id,
    source_id: item.sourceId,
    state: item.state,
    quote: item.quote,
    locator: item.locator,
    proposed_claim_id: item.proposedClaimId,
    history: item.history as any
  }, "project_id,evidence_id").catch(e => console.error("syncEvidenceItemToRelational failed:", e));
}

export async function deleteSourceFromRelational(projectId: string, sourceId: string) {
  if (process.env.NODE_ENV === "test") return;
  const config = getSupabaseRestConfig();
  if (!config) return;
  const table = new SupabaseTable(config, "project_sources");
  await table.delete(`project_id=eq.${projectId}&source_id=eq.${sourceId}`).catch(e => console.error("deleteSourceFromRelational failed:", e));
}
