/**
 * Project / Atlas / Conductor API route.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md,
 *       docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * The second route built on the new architecture (after
 * server/routes/studio.ts). Exposes the Atlas catalog for intake-form
 * rendering, and the Conductor's gate state machine for a project bound to
 * one output type. G0 (from Atlas intake answers) and G6 (from the Rubric,
 * once a document has been submitted via PUT .../document) have real,
 * computable exit-criteria sources through this surface. G1-G5 and G7 have
 * no requirement-extraction/sourcing/drafting/review/export pipeline to
 * compute criteria from yet (docs 30 §10). The sign-off and invalidate
 * endpoints below are gate-agnostic — they will work for any gate the
 * moment something else in the system starts calling updateExitCriteria
 * for it — but since G6's entry prerequisites (G1-G5 signed off) can't be
 * satisfied without those pipelines, G6 can be computed and inspected
 * through this API today but not yet actually signed off end-to-end; only
 * G0 can reach that today. Computing G6 correctly now, ahead of G1-G5
 * existing, means nothing changes here when they do.
 *
 * See src/app/conductor/projectStore.ts for the scope note on project
 * persistence.
 */

import express from "express";
import { catalog } from "../../src/app/atlas/atlas.ts";
import {
  computeG0ExitCriteria,
  computeG6ExitCriteria,
  updateExitCriteria,
  signOff,
  invalidateGate,
  summarize,
  GATE_ORDER,
  GateTransitionError,
} from "../../src/app/conductor/conductor.ts";
import type { GateId } from "../../src/app/conductor/conductor.ts";
import { createProject, getProject, saveProject } from "../../src/app/conductor/projectStore.ts";
import { evaluateAgainstOutputType } from "../../src/app/rubric/rubric.ts";
import type { Block, CanonicalDocument } from "../../src/domain/document/model.ts";
import { addClaim, bindEvidence, removeSource, unsupportedClaims, findConflicts, ClaimGraphError } from "../../src/domain/claim/graph.ts";
import type { Claim, ClaimEvidenceBinding, EvidenceSpan, SupportStrength } from "../../src/domain/claim/types.ts";

const BLOCK_KINDS = new Set(["paragraph", "heading1", "heading2", "heading3", "quote", "list-item"]);

function isValidBlock(value: unknown): value is Block {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return typeof b.id === "string" && typeof b.kind === "string" && BLOCK_KINDS.has(b.kind) && typeof b.text === "string";
}

function isValidDocument(value: unknown): value is CanonicalDocument {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.title !== "string" || !Array.isArray(d.blocks)) return false;
  if (!d.blocks.every(isValidBlock)) return false;
  if (d.metadata !== undefined) {
    if (typeof d.metadata !== "object" || d.metadata === null) return false;
    if (!Object.values(d.metadata as Record<string, unknown>).every((v) => typeof v === "string")) return false;
  }
  return true;
}

function isGateId(value: unknown): value is GateId {
  return typeof value === "string" && (GATE_ORDER as string[]).includes(value);
}

function isValidClaim(value: unknown): value is Claim {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.text !== "string") return false;
  if (c.draftSpanId !== undefined && typeof c.draftSpanId !== "string") return false;
  return true;
}

const SUPPORT_STRENGTHS = new Set(["strong", "moderate", "weak", "contradicts"]);

function isValidEvidenceSpan(value: unknown): value is EvidenceSpan {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.sourceId !== "string" || typeof e.quote !== "string") return false;
  if (typeof e.locator !== "object" || e.locator === null) return false;
  const l = e.locator as Record<string, unknown>;
  for (const key of ["page", "paragraph", "startOffset", "endOffset"]) {
    if (l[key] !== undefined && typeof l[key] !== "number") return false;
  }
  return true;
}

function isValidBinding(value: unknown): value is ClaimEvidenceBinding {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.claimId !== "string" || typeof b.rationale !== "string") return false;
  if (typeof b.strength !== "string" || !SUPPORT_STRENGTHS.has(b.strength as SupportStrength)) return false;
  if (!Array.isArray(b.evidence) || !b.evidence.every(isValidEvidenceSpan)) return false;
  return true;
}

function projectView(record: ReturnType<typeof getProject>) {
  if (!record) return undefined;
  return {
    projectId: record.projectId,
    outputTypeId: record.outputTypeId,
    answers: record.answers,
    hasDocument: record.document !== undefined,
    gates: summarize(record.gates),
  };
}

export function registerProjectRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  /** Summaries of every catalog entry — the "choose an output type" list (docs 12 F-PRJ-1). */
  app.get("/api/atlas/output-types", projectLimit, (_req, res) => {
    const items = catalog.list().map((s) => ({
      id: s.id,
      label: s.label,
      aliases: s.aliases,
      family: s.family,
      academicLevels: s.academicLevels,
      typicalDisciplines: s.typicalDisciplines,
    }));
    res.json({ items });
  });

  /** The full spec for one output type — what the intake form renders from. */
  app.get("/api/atlas/output-types/:id", projectLimit, (req, res) => {
    const spec = catalog.get(req.params.id);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${req.params.id}" in the catalog.` });
    }
    res.json(spec);
  });

  /** Create a project bound to an output type. Body: { outputTypeId }. */
  app.post("/api/projects", projectLimit, (req, res) => {
    const { outputTypeId } = req.body ?? {};
    if (typeof outputTypeId !== "string" || outputTypeId.length === 0) {
      return res.status(400).json({ error: "Missing required field: outputTypeId" });
    }
    const spec = catalog.get(outputTypeId);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${outputTypeId}" in the catalog.` });
    }
    const created = createProject(outputTypeId);
    // Compute G0's real exit criteria immediately from the (still empty)
    // answers, rather than leaving domain/project/gates.ts's default empty
    // exitCriteria in place — an empty criteria list is vacuously "ready"
    // (isReadyToSignOff's `.every()` over zero items), which would let a
    // caller sign off G0 before intake was ever computed once.
    const gates = updateExitCriteria(created.gates, "G0", computeG0ExitCriteria(spec, created.answers));
    const record = saveProject({ ...created, gates });
    res.status(201).json(projectView(record));
  });

  app.get("/api/projects/:id", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    res.json(projectView(record));
  });

  /**
   * Submit or update intake answers, recomputing G0's exit criteria
   * (docs 14 §5.2's per-field allowsProvisional contract, via
   * computeG0ExitCriteria). 409s if G0 is already signed off — invalidate
   * it first, so the "this used to be approved" transition is recorded
   * rather than silently overwritten (domain/project/gates.ts's guarantee).
   * Body: { answers: Record<string, string> }
   */
  app.patch("/api/projects/:id/intake", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    const { answers } = req.body ?? {};
    if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
      return res.status(400).json({ error: "Missing required field: answers (object)" });
    }
    for (const value of Object.values(answers)) {
      if (typeof value !== "string") {
        return res.status(400).json({ error: "Every answer value must be a string (use \"provisional\" for deferred fields)." });
      }
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const nextAnswers = { ...record.answers, ...(answers as Record<string, string>) };
    const criteria = computeG0ExitCriteria(spec, nextAnswers);

    try {
      const gates = updateExitCriteria(record.gates, "G0", criteria);
      const updated = saveProject({ ...record, answers: nextAnswers, gates });
      res.json(projectView(updated));
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  /**
   * Submit or replace the project's document body and recompute G6's exit
   * criteria against it (docs 30 §3 G6 "Exit": zero unresolved blocking or
   * required Rubric findings). Body: { document: CanonicalDocument }.
   * 409s if G6 is already signed off — invalidate it first, same guarantee
   * as the intake endpoint gives G0.
   */
  app.put("/api/projects/:id/document", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    const { document } = req.body ?? {};
    if (!isValidDocument(document)) {
      return res.status(400).json({ error: "Missing or malformed required field: document (CanonicalDocument — id, title, blocks[]: {id, kind, text})." });
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const rubricReport = evaluateAgainstOutputType(spec, document);
    const criteria = computeG6ExitCriteria(rubricReport);

    try {
      const gates = updateExitCriteria(record.gates, "G6", criteria);
      const updated = saveProject({ ...record, document, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  /** The most recent Rubric evaluation of the project's document. 404s if no document has been submitted yet. */
  app.get("/api/projects/:id/rubric", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    if (!record.rubricReport) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    res.json(record.rubricReport);
  });

  /** Add a claim to the project's Claim–Evidence Graph. Body: { claim: Claim }. 409s if the claim id is already used. */
  app.post("/api/projects/:id/claims", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    const { claim } = req.body ?? {};
    if (!isValidClaim(claim)) {
      return res.status(400).json({ error: "Missing or malformed required field: claim ({id, text, draftSpanId?})." });
    }
    try {
      const claimGraph = addClaim(record.claimGraph, claim);
      const updated = saveProject({ ...record, claimGraph });
      res.status(201).json({ ...projectView(updated), claimGraph });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  /**
   * Bind evidence to a claim. Body: { binding: ClaimEvidenceBinding }.
   * 400s if the claim doesn't exist, the binding id is already used, or the
   * binding has no evidence spans — a binding asserting support without a
   * real located quote is exactly what domain/claim's bindEvidence refuses
   * (AG-13's "never invents a locator" QA checkpoint).
   */
  app.post("/api/projects/:id/claims/:claimId/evidence", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    const { binding } = req.body ?? {};
    if (!isValidBinding(binding) || binding.claimId !== req.params.claimId) {
      return res.status(400).json({
        error: "Missing or malformed required field: binding ({id, claimId, evidence[]: {sourceId, locator, quote}, strength, rationale}); binding.claimId must match the URL.",
      });
    }
    try {
      const claimGraph = bindEvidence(record.claimGraph, binding);
      const updated = saveProject({ ...record, claimGraph });
      res.status(201).json({ ...projectView(updated), claimGraph });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  });

  /** The project's full Claim–Evidence Graph. */
  app.get("/api/projects/:id/claims", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    res.json(record.claimGraph);
  });

  /** Claims with zero evidence bindings — domain/claim's unsupportedClaims(), AG-13's "unsupported" output. */
  app.get("/api/projects/:id/claims/unsupported", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    res.json({ claims: unsupportedClaims(record.claimGraph) });
  });

  /** Claims with both a supporting and a contradicting binding, surfaced for a human to resolve (never auto-resolved). */
  app.get("/api/projects/:id/claims/conflicts", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    res.json({ conflicts: findConflicts(record.claimGraph) });
  });

  /**
   * Remove a source from the Claim–Evidence Graph: every binding loses any
   * evidence spans pointing at it, and any binding left with zero evidence
   * is dropped entirely (domain/claim's removeSource — mirrors a source
   * being un-approved or retracted after claims were already bound to it).
   */
  app.delete("/api/projects/:id/sources/:sourceId", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    const claimGraph = removeSource(record.claimGraph, req.params.sourceId);
    const updated = saveProject({ ...record, claimGraph });
    res.json({ ...projectView(updated), claimGraph });
  });

  /**
   * Sign off a gate. Body: { actor }. 409s if the gate is not ready (a
   * blocking exit criterion is unsatisfied, or entry prerequisites are
   * unmet). The approved snapshot is what a later content change is
   * detected against (docs 30 §2.2) — G0's is the intake answers, G6's is
   * the Rubric report; every other gate has no computed content yet (see
   * this file's module comment) so its snapshot is empty and it cannot
   * currently become ready to sign off through this API.
   */
  app.post("/api/projects/:id/gates/:gate/signoff", projectLimit, async (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { actor } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }

    const approvedSnapshot: unknown =
      req.params.gate === "G0"
        ? { answers: record.answers }
        : req.params.gate === "G6"
          ? { rubricReport: record.rubricReport }
          : {};

    try {
      const gates = await signOff(record.gates, req.params.gate, actor, approvedSnapshot);
      const updated = saveProject({ ...record, gates });
      res.json(projectView(updated));
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  /**
   * Invalidate a gate, cascading forward to every gate that depended on it
   * (domain/project/gates.ts's downstream cascade). Body: { reason }.
   */
  app.post("/api/projects/:id/gates/:gate/invalidate", projectLimit, (req, res) => {
    const record = getProject(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `No project "${req.params.id}".` });
    }
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { reason } = req.body ?? {};
    if (typeof reason !== "string" || reason.length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }

    const gates = invalidateGate(record.gates, req.params.gate, reason);
    const updated = saveProject({ ...record, gates });
    res.json(projectView(updated));
  });
}
