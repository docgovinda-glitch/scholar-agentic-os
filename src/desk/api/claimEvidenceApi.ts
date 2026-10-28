import { authedFetch, authedJsonFetch, json } from "./client";
import type {
  Claim,
  ClaimEvidenceBinding,
  ClaimEvidenceGraph,
  DiscoveredSource,
  EvidenceConflict,
  EvidenceLedger,
  EvidenceLocator,
  ProjectView,
  RubricReport,
  SupportStrength,
} from "../types";
import type { ClaimGraphMutationResult } from "./types";

export function getClaimGraph(projectId: string): Promise<ClaimEvidenceGraph> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/claims`).then((r) => json(r));
}

export function getUnsupportedClaims(projectId: string): Promise<{ claims: Claim[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/claims/unsupported`).then((r) => json(r));
}

export function getClaimConflicts(projectId: string): Promise<{ conflicts: EvidenceConflict[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/claims/conflicts`).then((r) => json(r));
}

export function getClaimsForSource(projectId: string, sourceId: string): Promise<{ claims: Claim[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/claims`).then((r) => json(r));
}

export function addClaim(projectId: string, claim: Claim): Promise<ClaimGraphMutationResult> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/claims`, "POST", { claim }).then((r) => json(r));
}

export function bindEvidence(projectId: string, binding: ClaimEvidenceBinding): Promise<ClaimGraphMutationResult> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/claims/${encodeURIComponent(binding.claimId)}/evidence`,
    "POST",
    { binding }
  ).then((r) => json(r));
}

export function removeSource(projectId: string, sourceId: string): Promise<ClaimGraphMutationResult> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  }).then((r) => json(r));
}

export function waiveFinding(projectId: string, ruleId: string, reason: string): Promise<ProjectView & { rubric: RubricReport }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/rubric/waive`, "POST", { ruleId, reason }).then((r) => json(r));
}

export function getEvidenceLedger(projectId: string): Promise<EvidenceLedger> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-ledger`).then((r) => json(r));
}

export function addManualSource(
  projectId: string,
  source: Omit<DiscoveredSource, "id" | "discoveredAt" | "discoveredVia"> & { discoveredVia?: "manual" | "vault"; vaultItemId?: string }
): Promise<EvidenceLedger> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/sources`, "POST", source).then((r) => json(r));
}

export function discoverSources(
  projectId: string,
  query: string,
  via: "arxiv" | "openalex" | "web_search"
): Promise<{ added: DiscoveredSource[]; evidenceLedger: EvidenceLedger }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/discover`, "POST", { query, via }).then((r) => json(r));
}

export function extractEvidenceQuote(
  projectId: string,
  sourceId: string,
  quote: string,
  locator?: EvidenceLocator
): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/sources/${encodeURIComponent(sourceId)}/extract`,
    "POST",
    { quote, locator }
  ).then((r) => json(r));
}

export function verifyEvidenceItem(projectId: string, evidenceId: string, actor: string): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/verify`,
    "POST",
    { actor }
  ).then((r) => json(r));
}

export function proposeEvidenceItem(projectId: string, evidenceId: string, claimId: string, actor: string): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/propose`,
    "POST",
    { claimId, actor }
  ).then((r) => json(r));
}

export function approveEvidenceItem(
  projectId: string,
  evidenceId: string,
  params: { actor: string; strength: SupportStrength; rationale: string }
): Promise<{ evidenceLedger: EvidenceLedger; claimGraph: ClaimEvidenceGraph; rubric?: RubricReport }> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/approve`,
    "POST",
    params
  ).then((r) => json(r));
}

export function rejectEvidenceItem(projectId: string, evidenceId: string, actor: string, reason: string): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/reject`,
    "POST",
    { actor, reason }
  ).then((r) => json(r));
}
