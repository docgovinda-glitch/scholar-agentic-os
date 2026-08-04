/**
 * Project / Atlas / Conductor API route.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md,
 *       docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * The second route built on the new architecture (after
 * server/routes/studio.ts). Exposes the Atlas catalog for intake-form
 * rendering, and the Conductor's gate state machine for a project bound to
 * one output type. G0 (from Atlas intake answers), G3 (from the Atlas
 * structure plus the document and intake answers — see
 * computeG3ExitCriteria's own comment for what's deliberately not modeled),
 * and G6 (from the Rubric, once a document has been submitted via
 * PUT .../document) have real, computable exit-criteria sources through
 * this surface. G1, G2, G4, G5, and G7 have no requirement-extraction/
 * sourcing/drafting/review/export pipeline to compute criteria from yet
 * (docs 30 §10). The sign-off and invalidate endpoints below are
 * gate-agnostic — they will work for any gate the moment something else in
 * the system starts calling updateExitCriteria for it — but since G3's
 * entry prerequisites (G0, G2) and G6's (G1-G5) can't all be satisfied
 * without the missing pipelines, only G0 can reach an actual sign-off
 * end-to-end through this API today (G2 and G3 can if a caller manually
 * signs off G2 with an empty criteria list, same as this file's own tests
 * do — G2 has no compute function of its own yet). Computing G3 and G6
 * correctly now, ahead of the gates upstream of them existing, means
 * nothing changes here when those do.
 *
 * Persistence goes through src/services/store/projectStore.ts's
 * getProjectStore() — an in-memory Map when DATABASE_URL is unset (tests,
 * un-configured dev), Postgres (src/services/store/pgProjectStore.ts) once
 * it's set. Every handler below is async and awaits the store accordingly.
 */

import express from "express";
import { catalog } from "../../src/app/atlas/atlas.ts";
import {
  computeG0ExitCriteria,
  computeG3ExitCriteria,
  computeG6ExitCriteria,
  intakeCompleteness,
  updateExitCriteria,
  signOff,
  invalidateGate,
  summarize,
  GATE_ORDER,
  GateTransitionError,
} from "../../src/app/conductor/conductor.ts";
import type { GateId } from "../../src/app/conductor/conductor.ts";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import type { ProjectRecord } from "../../src/services/store/types.ts";
import { exportDocument } from "../../src/app/export/export.ts";
import type { ExportFormat } from "../../src/app/export/types.ts";
import { buildReport, compileRubricFromOutputType, applyWaivers, waiveRule, RuleNotWaivableError } from "../../src/app/rubric/rubric.ts";
import { emptyDocument } from "../../src/domain/document/model.ts";
import type { Block, CanonicalDocument } from "../../src/domain/document/model.ts";
import { addClaim, bindEvidence, removeSource, unsupportedClaims, findConflicts, claimsDependingOnSource, ClaimGraphError } from "../../src/domain/claim/graph.ts";
import type { Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, EvidenceSpan, SupportStrength } from "../../src/domain/claim/types.ts";

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

/**
 * Recompute the Rubric report and G6 exit criteria from a project's
 * waivers and claim graph, against an explicit document — the single
 * place that combines all three so document edits, waiver changes, and
 * claim-graph changes all reach the same evaluation. The caller supplies
 * the document explicitly (rather than reading `record.document`) so it
 * works both for a document being submitted for the first time and for
 * re-evaluating against the document already on record. Throws
 * GateTransitionError (via updateExitCriteria) if G6 is already signed
 * off, same as every other gate-touching endpoint.
 */
/**
 * Recompute G3's exit criteria (docs 30 §3 G3 "Exit") from the project's
 * output type, its document as it stands right now, and its intake
 * answers as they stand right now — called from both the intake and
 * document endpoints below, since a G3 criterion can change from either
 * side (a deferred field getting resolved, or a section being added).
 * Falls back to an empty placeholder document when the project has none
 * yet, so `PATCH .../intake` can recompute G3 before any document exists —
 * every section-presence criterion is correctly unsatisfied against it.
 * Throws GateTransitionError (via updateExitCriteria) if G3 is already
 * signed off, same "invalidate first" discipline as every other
 * gate-touching endpoint.
 */
function recomputeG3(record: ProjectRecord, document: CanonicalDocument | undefined, answers: Record<string, string>) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const criteria = computeG3ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), answers);
  return updateExitCriteria(record.gates, "G3", criteria);
}

function recomputeG6(record: ProjectRecord, document: CanonicalDocument) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const rules = applyWaivers(compileRubricFromOutputType(spec), record.waivers);
  const rubricReport = buildReport(rules, document, record.claimGraph);
  const criteria = computeG6ExitCriteria(rubricReport);
  const gates = updateExitCriteria(record.gates, "G6", criteria);
  return { rubricReport, gates };
}

function projectView(record: ProjectRecord | undefined) {
  if (!record) return undefined;
  const spec = catalog.getOrThrow(record.outputTypeId);
  return {
    projectId: record.projectId,
    outputTypeId: record.outputTypeId,
    answers: record.answers,
    /** Fraction (0-1) of every intake field (required, recommended, and optional) that has an answer — informational, not gating (only required fields block G0). */
    intakeCompleteness: intakeCompleteness(spec, record.answers),
    hasDocument: record.document !== undefined,
    gates: summarize(record.gates),
  };
}

/** The authenticated Supabase user attached by requireAuth. */
function currentUserId(req: express.Request): string {
  return (req as express.Request & { user?: { id: string } }).user!.id;
}

/**
 * Fetch a project and authorise the caller against it in one step.
 *
 * Returns the record, or null once it has already sent the response — so
 * every handler is `const record = await loadOwnedProject(...); if (!record) return;`
 * and cannot forget the ownership half.
 *
 * A project owned by someone else returns 404, not 403. 403 would confirm
 * that the id names a real project, which turns any id-guessing attempt into
 * an existence oracle; 404 makes "not yours" and "not there" indistinguishable
 * from outside. That mattered more than usual here, because these ids used to
 * be sequential — see generateProjectId.
 */
async function loadOwnedProject(
  store: { get(id: string): Promise<ProjectRecord | undefined> },
  req: express.Request,
  res: express.Response
): Promise<ProjectRecord | null> {
  const record = await store.get(req.params.id);
  if (!record || record.ownerId !== currentUserId(req)) {
    res.status(404).json({ error: `No project "${req.params.id}".` });
    return null;
  }
  return record;
}

/**
 * Wrap an async route handler so a rejection becomes a 500 rather than an
 * unhandled rejection.
 *
 * Express 4 does not await handlers, so `async (req, res) => { await db... }`
 * has no error path at all: a failed query rejects, nothing catches it, and
 * Node terminates the process. That is exactly what happened in production —
 * one database connection failure returned 502 for every route in the service,
 * including ones that never touch the database.
 */
function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch((err: unknown) => {
      console.error(`${req.method} ${req.originalUrl} failed:`, err);
      // A handler may already have answered before throwing.
      if (res.headersSent) return next(err);
      res.status(500).json({ error: "Something went wrong handling that request." });
    });
  };
}

export function registerProjectRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  const store = getProjectStore();

  // Everything under /api/projects requires a verified Supabase session.
  //
  // Previously nothing here did. Combined with projects having no owner and
  // sequential ids, any unauthenticated caller could create projects, read
  // and overwrite anyone else's by walking the id space, and drive the
  // model-backed export path. The Atlas catalog routes below are deliberately
  // left public: they are a static list of output types with no user data in
  // them, and the "choose what you are writing" screen reads them.
  app.use("/api/projects", requireAuth);

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
  app.post("/api/projects", projectLimit, asyncRoute(async (req, res) => {
    const { outputTypeId } = req.body ?? {};
    if (typeof outputTypeId !== "string" || outputTypeId.length === 0) {
      return res.status(400).json({ error: "Missing required field: outputTypeId" });
    }
    const spec = catalog.get(outputTypeId);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${outputTypeId}" in the catalog.` });
    }
    const created = await store.create(outputTypeId, currentUserId(req));
    // Compute G0's and G3's real exit criteria immediately from the (still
    // empty) answers/document, rather than leaving domain/project/gates.ts's
    // default empty exitCriteria in place — an empty criteria list is
    // vacuously "ready" (isReadyToSignOff's `.every()` over zero items),
    // which would let a caller sign off before anything was ever computed.
    let gates = updateExitCriteria(created.gates, "G0", computeG0ExitCriteria(spec, created.answers));
    gates = recomputeG3({ ...created, gates }, undefined, created.answers);
    const record = await store.save({ ...created, gates });
    res.status(201).json(projectView(record));
  }));

  /**
   * The caller's own projects, most recently updated first — Desk's entry
   * screen reads this.
   *
   * Owner scoping happens in the store (listByOwner), not by filtering a
   * full listing here: there is no code path that can return every project,
   * so no future handler can accidentally expose one.
   *
   * Registered before "/api/projects/:id" so Express does not match the bare
   * collection path as an id.
   */
  app.get("/api/projects", projectLimit, asyncRoute(async (req, res) => {
    const records = await store.listByOwner(currentUserId(req));
    res.json({ items: records.map((r) => projectView(r)) });
  }));

  app.get("/api/projects/:id", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(projectView(record));
  }));

  /**
   * Submit or update intake answers, recomputing G0's exit criteria
   * (docs 14 §5.2's per-field allowsProvisional contract, via
   * computeG0ExitCriteria). 409s if G0 is already signed off — invalidate
   * it first, so the "this used to be approved" transition is recorded
   * rather than silently overwritten (domain/project/gates.ts's guarantee).
   * Body: { answers: Record<string, string> }
   */
  app.patch("/api/projects/:id/intake", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
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
      let gates = updateExitCriteria(record.gates, "G0", criteria);
      gates = recomputeG3({ ...record, gates }, record.document, nextAnswers);
      const updated = await store.save({ ...record, answers: nextAnswers, gates });
      res.json(projectView(updated));
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Submit or replace the project's document body and recompute G6's exit
   * criteria against it (docs 30 §3 G6 "Exit": zero unresolved blocking or
   * required Rubric findings). Body: { document: CanonicalDocument }.
   * 409s if G6 is already signed off — invalidate it first, same guarantee
   * as the intake endpoint gives G0. Rules are recompiled fresh from Atlas
   * and any previously recorded waivers are reapplied (applyWaivers) so a
   * waiver survives a document resubmission rather than silently resetting.
   */
  app.put("/api/projects/:id/document", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { document } = req.body ?? {};
    if (!isValidDocument(document)) {
      return res.status(400).json({ error: "Missing or malformed required field: document (CanonicalDocument — id, title, blocks[]: {id, kind, text})." });
    }

    try {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(record, document);
      const gates = recomputeG3({ ...record, gates: gatesAfterG6 }, document, record.answers);
      const updated = await store.save({ ...record, document, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** The most recent Rubric evaluation of the project's document. 404s if no document has been submitted yet. */
  app.get("/api/projects/:id/rubric", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.rubricReport) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    res.json(record.rubricReport);
  }));

  /**
   * Waive a non-blocking Rubric finding with a reason (docs 31 §7:
   * "Reason required. Appears in the compliance report"). Body:
   * { ruleId, reason }. Requires a document to already have been
   * submitted — there is nothing to re-evaluate otherwise. 404s if
   * `ruleId` doesn't name a rule this output type compiles. 400s if the
   * rule is blocking severity (never waivable by design) or the reason is
   * empty. Recomputes G6's exit criteria from the waived report, same as
   * the document endpoint.
   */
  app.post("/api/projects/:id/rubric/waive", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    const { ruleId, reason } = req.body ?? {};
    if (typeof ruleId !== "string" || ruleId.length === 0) {
      return res.status(400).json({ error: "Missing required field: ruleId" });
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const rules = applyWaivers(compileRubricFromOutputType(spec), record.waivers);
    if (!rules.some((r) => r.id === ruleId)) {
      return res.status(404).json({ error: `No rule "${ruleId}" for this project's output type.` });
    }

    try {
      const waivedRules = waiveRule(rules, ruleId, reason);
      const newWaiver = waivedRules.find((r) => r.id === ruleId)!.waived!;
      const waivers = { ...record.waivers, [ruleId]: newWaiver };
      const rubricReport = buildReport(waivedRules, record.document, record.claimGraph);
      const criteria = computeG6ExitCriteria(rubricReport);
      const gates = updateExitCriteria(record.gates, "G6", criteria);
      const updated = await store.save({ ...record, waivers, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport });
    } catch (err) {
      if (err instanceof RuleNotWaivableError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Save a claim-graph change, then — if the project already has a
   * document — recompute G6 against it, since four catalog gates
   * (`usesClaimGraph`) depend on the graph, not just the document. Returns
   * the saved record. Throws GateTransitionError if G6 is already signed
   * off, same "invalidate first" guarantee as every other Rubric-relevant
   * change.
   */
  function saveClaimGraphChange(record: ProjectRecord, claimGraph: ClaimEvidenceGraph) {
    if (!record.document) {
      return store.save({ ...record, claimGraph });
    }
    const { rubricReport, gates } = recomputeG6({ ...record, claimGraph }, record.document);
    return store.save({ ...record, claimGraph, rubricReport, gates });
  }

  /**
   * Add a claim to the project's Claim–Evidence Graph. Body:
   * { claim: Claim }. 409s if the claim id is already used. If the project
   * already has a document, recomputes G6 (four catalog gates check the
   * claim graph, not the document — see fromAtlas.ts's
   * compileClaimSupportGateRules) — 409s if G6 is already signed off.
   */
  app.post("/api/projects/:id/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { claim } = req.body ?? {};
    if (!isValidClaim(claim)) {
      return res.status(400).json({ error: "Missing or malformed required field: claim ({id, text, draftSpanId?})." });
    }
    try {
      const claimGraph = addClaim(record.claimGraph, claim);
      const updated = await saveClaimGraphChange(record, claimGraph);
      res.status(201).json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(409).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Bind evidence to a claim. Body: { binding: ClaimEvidenceBinding }.
   * 400s if the claim doesn't exist, the binding id is already used, or the
   * binding has no evidence spans — a binding asserting support without a
   * real located quote is exactly what domain/claim's bindEvidence refuses
   * (AG-13's "never invents a locator" QA checkpoint). Recomputes G6 if a
   * document already exists — this is exactly the action that turns a
   * failing claim_support finding into a passing one.
   */
  app.post("/api/projects/:id/claims/:claimId/evidence", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { binding } = req.body ?? {};
    if (!isValidBinding(binding) || binding.claimId !== req.params.claimId) {
      return res.status(400).json({
        error: "Missing or malformed required field: binding ({id, claimId, evidence[]: {sourceId, locator, quote}, strength, rationale}); binding.claimId must match the URL.",
      });
    }
    try {
      const claimGraph = bindEvidence(record.claimGraph, binding);
      const updated = await saveClaimGraphChange(record, claimGraph);
      res.status(201).json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** The project's full Claim–Evidence Graph. */
  app.get("/api/projects/:id/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.claimGraph);
  }));

  /** Claims with zero evidence bindings — domain/claim's unsupportedClaims(), AG-13's "unsupported" output. */
  app.get("/api/projects/:id/claims/unsupported", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: unsupportedClaims(record.claimGraph) });
  }));

  /** Claims with both a supporting and a contradicting binding, surfaced for a human to resolve (never auto-resolved). */
  app.get("/api/projects/:id/claims/conflicts", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ conflicts: findConflicts(record.claimGraph) });
  }));

  /**
   * Every claim with at least one evidence binding citing `sourceId` —
   * domain/claim's claimsDependingOnSource(), "which claims depend on
   * source X" (docs 13). Useful before retracting a source: this is what
   * `DELETE .../sources/:sourceId` is about to affect.
   */
  app.get("/api/projects/:id/sources/:sourceId/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: claimsDependingOnSource(record.claimGraph, req.params.sourceId) });
  }));

  /**
   * Remove a source from the Claim–Evidence Graph: every binding loses any
   * evidence spans pointing at it, and any binding left with zero evidence
   * is dropped entirely (domain/claim's removeSource — mirrors a source
   * being un-approved or retracted after claims were already bound to it).
   * Recomputes G6 if a document already exists — a retracted source can
   * turn a passing claim_support finding into a failing one.
   */
  app.delete("/api/projects/:id/sources/:sourceId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const claimGraph = removeSource(record.claimGraph, req.params.sourceId);
    try {
      const updated = await saveClaimGraphChange(record, claimGraph);
      res.json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Sign off a gate. Body: { actor }. 409s if the gate is not ready (a
   * blocking exit criterion is unsatisfied, or entry prerequisites are
   * unmet). The approved snapshot is what a later content change is
   * detected against (docs 30 §2.2) — G0's is the intake answers, G3's is
   * the document's block ids plus the intake answers, G6's is the Rubric
   * report; every other gate has no computed content yet (see this file's
   * module comment) so its snapshot is empty.
   */
  app.post("/api/projects/:id/gates/:gate/signoff", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
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
        : req.params.gate === "G3"
          ? { blockIds: record.document?.blocks.map((b) => b.id) ?? [], answers: record.answers }
          : req.params.gate === "G6"
            ? { rubricReport: record.rubricReport }
            : {};

    try {
      const gates = await signOff(record.gates, req.params.gate, actor, approvedSnapshot);
      const updated = await store.save({ ...record, gates });
      res.json(projectView(updated));
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Invalidate a gate, cascading forward to every gate that depended on it
   * (domain/project/gates.ts's downstream cascade). Body: { reason }.
   */
  app.post("/api/projects/:id/gates/:gate/invalidate", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { reason } = req.body ?? {};
    if (typeof reason !== "string" || reason.length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }

    const gates = invalidateGate(record.gates, req.params.gate, reason);
    const updated = await store.save({ ...record, gates });
    res.json(projectView(updated));
  }));

  /**
   * Export the project's document to the specified format.
   * Body: { format: "docx" | "odt" | "pdf" }
   * Returns: the file as application/octet-stream with Content-Disposition header.
   *
   * Spec: docs/03-workflow/33-EXPORT-ARCHITECTURE.md §3 (five-stage pipeline).
   * Currently supports: DOCX only. ODT and PDF in Phase 3.11–3.12.
   */
  app.post("/api/projects/:id/export", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot export a project with no document submitted yet." });
    }

    const { format } = req.body ?? {};
    if (typeof format !== "string" || !["docx", "odt", "pdf"].includes(format)) {
      return res.status(400).json({ error: "Invalid export format. Must be one of: docx, odt, pdf" });
    }

    try {
      const result = await exportDocument({
        document: record.document,
        format: format as ExportFormat,
        title: record.document.title,
        author: "Scholar OS",
      });

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.setHeader("Content-Length", result.byteSize);
      res.send(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }));
}
