import express from "express";
import crypto from "crypto";
import { 
  asyncRoute, 
  loadOwnedProject, 
  getSharedStore, 
  projectView, 
  recomputeG2,
  recomputeG4,
  recomputeG6
} from "../project.ts";
import { 
  discoverSource, 
  extractEvidence, 
  verifyEvidence, 
  proposeEvidence, 
  approveEvidence, 
  rejectEvidence, 
  EvidenceStateError 
} from "../../../src/domain/evidence/stateMachine.ts";
import type { DiscoveredSource, EvidenceLocator } from "../../../src/domain/evidence/types.ts";
import { discoverArxivSources, discoverOpenAlexSources, discoverWebSources } from "../../src/discovery/discovery.ts";
import { bindEvidence, ClaimGraphError } from "../../../src/domain/claim/graph.ts";
import type { ClaimEvidenceBinding, SupportStrength } from "../../../src/domain/claim/types.ts";
import { GateTransitionError, summarize } from "../../../src/app/conductor/conductor.ts";
import { ManualSourceSchema, EvidenceLocatorSchema } from "../../../src/domain/schemas/projectSchemas.ts";
import { syncSourceToRelational, syncEvidenceItemToRelational, syncBindingToRelational } from "../../src/syncRelational.ts";

const SOURCE_TYPES = new Set(["scholarly", "official", "web", "media", "user_provided", "vault"]);
const AUTHORITY_TIERS = new Set(["A", "B", "C", "D"]);
const SUPPORT_STRENGTHS = new Set(["strong", "moderate", "weak", "contradicts"]);

function isValidManualSource(
  value: unknown
): value is Omit<DiscoveredSource, "id" | "discoveredAt" | "discoveredVia"> & { discoveredVia?: "manual" | "vault"; vaultItemId?: string } {
  return ManualSourceSchema.safeParse(value).success;
}

function isValidLocator(value: unknown): value is EvidenceLocator {
  return EvidenceLocatorSchema.safeParse(value).success;
}

export function registerEvidenceRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  const store = getSharedStore();

  app.get("/api/projects/:id/evidence-ledger", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.evidenceLedger);
  }));

  app.post("/api/projects/:id/evidence-ledger/sources", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isValidManualSource(req.body)) {
      return res.status(400).json({
        error: "Invalid source. Required: title (string), authors (string[]), sourceType (one of: " +
          `${[...SOURCE_TYPES].join(", ")}), authorityTier (one of: ${[...AUTHORITY_TIERS].join(", ")}). Optional: url, doi, venue (strings), year (number).`,
      });
    }
    const source: DiscoveredSource = {
      ...req.body,
      id: `src-${crypto.randomUUID()}`,
      discoveredVia: req.body.discoveredVia ?? "manual",
      discoveredAt: new Date().toISOString(),
    };
    try {
      const evidenceLedger = discoverSource(record.evidenceLedger, source);
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
      await syncSourceToRelational(updated.projectId, source);
      res.status(201).json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  app.post("/api/projects/:id/evidence-ledger/discover", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { query, via, domains } = req.body ?? {};
    if (typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: query" });
    }
    if (via !== "arxiv" && via !== "openalex" && via !== "web_search") {
      return res.status(400).json({ error: 'Invalid field: via. Must be "arxiv", "openalex", or "web_search".' });
    }
    if (domains !== undefined && (!Array.isArray(domains) || !domains.every((d) => typeof d === "string"))) {
      return res.status(400).json({ error: "Invalid field: domains (string[])." });
    }

    let drafts: Awaited<ReturnType<typeof discoverArxivSources>>;
    try {
      drafts = via === "arxiv" ? await discoverArxivSources(query) : via === "openalex" ? await discoverOpenAlexSources(query) : await discoverWebSources(query, domains);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(502).json({ error: `Discovery failed: ${message}` });
    }

    const now = new Date().toISOString();
    let evidenceLedger = record.evidenceLedger;
    const added: DiscoveredSource[] = [];
    for (const draft of drafts) {
      const source: DiscoveredSource = { ...draft, id: `src-${crypto.randomUUID()}`, discoveredAt: now };
      evidenceLedger = discoverSource(evidenceLedger, source);
      added.push(source);
    }
    const gates = recomputeG2({ ...record, evidenceLedger });
    const updated = await store.save({ ...record, evidenceLedger, gates });
    for (const source of added) {
      await syncSourceToRelational(updated.projectId, source);
    }
    res.json({ added, evidenceLedger: updated.evidenceLedger });
  }));

  app.post("/api/projects/:id/evidence-ledger/sources/:sourceId/extract", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { quote, locator } = req.body ?? {};
    if (typeof quote !== "string" || quote.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: quote" });
    }
    if (!isValidLocator(locator)) {
      return res.status(400).json({ error: "Invalid field: locator ({page?, paragraph?, startOffset?, endOffset?}, all numbers)." });
    }
    try {
      const evidenceLedger = extractEvidence(record.evidenceLedger, { id: `ev-${crypto.randomUUID()}`, sourceId: req.params.sourceId, quote, locator });
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
      const item = evidenceLedger.items.find(i => i.sourceId === req.params.sourceId && i.quote === quote);
      if (item) await syncEvidenceItemToRelational(updated.projectId, item);
      res.status(201).json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown source") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/verify", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { actor } = req.body ?? {};
    try {
      const evidenceLedger = verifyEvidence(record.evidenceLedger, req.params.evidenceId, typeof actor === "string" ? actor : undefined);
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
      const item = evidenceLedger.items.find(i => i.id === req.params.evidenceId);
      if (item) await syncEvidenceItemToRelational(updated.projectId, item);
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/propose", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { claimId, actor } = req.body ?? {};
    if (typeof claimId !== "string" || claimId.length === 0) {
      return res.status(400).json({ error: "Missing required field: claimId" });
    }
    if (!record.claimGraph.claims.some((c) => c.id === claimId)) {
      return res.status(400).json({ error: `Cannot propose evidence against unknown claim "${claimId}".` });
    }
    try {
      const evidenceLedger = proposeEvidence(record.evidenceLedger, req.params.evidenceId, claimId, typeof actor === "string" ? actor : undefined);
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
      const item = evidenceLedger.items.find(i => i.id === req.params.evidenceId);
      if (item) await syncEvidenceItemToRelational(updated.projectId, item);
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/approve", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { actor, strength, rationale } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    if (typeof strength !== "string" || !SUPPORT_STRENGTHS.has(strength as SupportStrength)) {
      return res.status(400).json({ error: `Missing or invalid field: strength. Must be one of: ${[...SUPPORT_STRENGTHS].join(", ")}` });
    }
    if (typeof rationale !== "string" || rationale.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: rationale" });
    }

    let evidenceLedger;
    try {
      evidenceLedger = approveEvidence(record.evidenceLedger, req.params.evidenceId, actor);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }

    const item = evidenceLedger.items.find((i) => i.id === req.params.evidenceId)!;
    const binding: ClaimEvidenceBinding = {
      id: `binding-${crypto.randomUUID()}`,
      claimId: item.proposedClaimId!,
      evidence: [{ sourceId: item.sourceId, locator: item.locator ?? {}, quote: item.quote! }],
      strength: strength as SupportStrength,
      rationale,
    };

    try {
      const claimGraph = bindEvidence(record.claimGraph, binding);
      const recordWithLedger = { ...record, evidenceLedger };
      const gatesAfterG2 = recomputeG2({ ...recordWithLedger, claimGraph });
      const updated = record.document
        ? await (async () => {
            const { rubricReport, gates: gatesAfterG6 } = recomputeG6({ ...recordWithLedger, claimGraph, gates: gatesAfterG2 }, record.document!);
            const gates = recomputeG4({ ...recordWithLedger, claimGraph, gates: gatesAfterG6 }, record.document);
            return store.save({ ...recordWithLedger, claimGraph, rubricReport, gates });
          })()
        : await store.save({ ...recordWithLedger, claimGraph, gates: recomputeG4({ ...recordWithLedger, claimGraph, gates: gatesAfterG2 }, undefined) });
      await syncEvidenceItemToRelational(updated.projectId, item);
      await syncBindingToRelational(updated.projectId, binding);
      res.json({ evidenceLedger: updated.evidenceLedger, claimGraph: updated.claimGraph, gates: summarize(updated.gates), ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof ClaimGraphError) return res.status(409).json({ error: err.message });
      if (err instanceof GateTransitionError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/reject", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { actor, reason } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }
    try {
      const evidenceLedger = rejectEvidence(record.evidenceLedger, req.params.evidenceId, actor, reason);
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
      const item = evidenceLedger.items.find(i => i.id === req.params.evidenceId);
      if (item) await syncEvidenceItemToRelational(updated.projectId, item);
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  app.post("/api/projects/:id/gates/G2/accept-smaller-corpus", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { reason, actor } = req.body ?? {};
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    const sourceCountOverride = { reason, acceptedBy: actor, at: new Date().toISOString() };
    const gates = recomputeG2({ ...record, sourceCountOverride });
    const updated = await store.save({ ...record, sourceCountOverride, gates });
    res.json(projectView(updated));
  }));
}
