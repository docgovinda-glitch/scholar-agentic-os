import crypto from "crypto";
import express from "express";
import { catalog } from "../../src/app/atlas/atlas.ts";
import {
  computeG0ExitCriteria,
  computeG6ExitCriteria,
  computeG7ExitCriteria,
  updateExitCriteria,
  GateTransitionError,
} from "../../src/app/conductor/conductor.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import {
  buildReport,
  compileRubricFromOutputType,
  applyWaivers,
  waiveRule,
  RuleNotWaivableError,
} from "../../src/app/rubric/rubric.ts";

import { claimsRouter } from "./project/claims";
import { evidenceRouter } from "./project/evidence";
import { agenticRouter } from "./project/agentic";
import assignmentRouter from "./project/assignment";
import thesisRouter from "./project/thesis";
import proposalRouter from "./project/proposal";
import presentationRouter from "./project/presentation";
import { journalComplianceRouter } from "./project/journal_compliance";
import parseRouter from "./project/parse";
import { activityRouter } from "./project/activity";
import { filesRouter } from "./project/files";
import { meshRouter } from "./project/mesh";
import { registerSubmissionsRoutes } from "./project/submissions";
import { deleteSourceFromRelational } from "../src/syncRelational";

import { approveEvidence, rejectEvidence } from "../../src/domain/evidence/stateMachine.ts";
import { removeSource, claimsDependingOnSource } from "../../src/domain/claim/graph.ts";
import { countWords, MIN_GUIDELINES_WORDS } from "../../src/domain/journal/types.ts";
import type { JournalRequirements } from "../../src/domain/journal/types.ts";
import { isOutputTypeEnabled, MAINTENANCE_MESSAGE } from "./outputTypeAccess.ts";
import { extractJournalRequirements, GatewayDenied } from "../../src/app/journal/extract.ts";
import { getPolicyForSession } from "../../src/app/studio/sessionPolicyStore.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";
import { summarize } from "../../src/app/conductor/conductor.ts";

import {
  isValidDocument,
  isValidJournalRequirementsInput,
  recomputeG1,
  recomputeG2 as _recomputeG2,
  recomputeG3,
  recomputeG4 as _recomputeG4,
  recomputeG6 as _recomputeG6,
  projectView as _projectView,
  saveClaimGraphChange as _saveClaimGraphChange,
  currentUserId as _currentUserId,
  loadOwnedProject as _loadOwnedProject,
  asyncRoute as _asyncRoute,
  getSharedStore as _getSharedStore,
  __resetSharedStoreForTests as ___resetSharedStoreForTests,
} from "./project/core/projectHelpers.ts";
import { registerManuscriptAndGateRoutes } from "./project/core/manuscriptAndGateRoutes.ts";
import type { ProjectRecord, ProjectStore } from "../../src/services/store/types.ts";
import type { CanonicalDocument } from "../../src/domain/document/model.ts";
import type { ClaimEvidenceGraph } from "../../src/domain/claim/types.ts";

export function recomputeG2(record: ProjectRecord) {
  return _recomputeG2(record);
}
export function recomputeG4(record: ProjectRecord, document: CanonicalDocument | undefined) {
  return _recomputeG4(record, document);
}
export function recomputeG6(record: ProjectRecord, document: CanonicalDocument) {
  return _recomputeG6(record, document);
}
export function projectView(record: ProjectRecord | undefined) {
  return _projectView(record);
}
export function saveClaimGraphChange(store: ProjectStore, record: ProjectRecord, claimGraph: ClaimEvidenceGraph) {
  return _saveClaimGraphChange(store, record, claimGraph);
}
export function currentUserId(req: express.Request): string {
  return _currentUserId(req);
}
export async function loadOwnedProject(
  store: { get(id: string): Promise<ProjectRecord | undefined> },
  req: express.Request,
  res: express.Response
): Promise<ProjectRecord | null> {
  return _loadOwnedProject(store, req, res);
}
export function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => _asyncRoute(handler)(req, res, next);
}
export function getSharedStore() {
  return _getSharedStore();
}
export function __resetSharedStoreForTests(): void {
  return ___resetSharedStoreForTests();
}

export function registerProjectRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  const store = getSharedStore();

  const router = express.Router();
  router.use(requireAuth);
  router.use("/:id/claims", claimsRouter(projectLimit));
  router.use("/:id/evidence", evidenceRouter(projectLimit));
  router.use("/:id/evidence-ledger", evidenceRouter(projectLimit));
  router.use("/:id/activity", activityRouter);
  router.use("/:id/files", filesRouter);
  router.use("/:id/agent", agenticRouter);
  router.use("/:id/agentic", agenticRouter);
  router.use("/:id/assignment", assignmentRouter);
  router.use("/:id/thesis", thesisRouter);
  router.use("/:id/proposal", proposalRouter);
  router.use("/:id/presentation", presentationRouter);
  router.use("/:id/parse-file", parseRouter);
  router.use("/:id/compliance", journalComplianceRouter(projectLimit));
  router.use("/:id/mesh", meshRouter);

  router.get("/:id/sources/:sourceId/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: claimsDependingOnSource(record.claimGraph, req.params.sourceId) });
  }));

  router.delete("/:id/sources/:sourceId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const claimGraph = removeSource(record.claimGraph, req.params.sourceId);
    try {
      const updated = await saveClaimGraphChange(store, record, claimGraph);
      await deleteSourceFromRelational(updated.projectId, req.params.sourceId);
      res.json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  router.post("/:id/gates/G2/accept-smaller-corpus", projectLimit, asyncRoute(async (req, res) => {
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
  
  // Manual Human Editor Routes for relational data overrides
  function pickAllowedFields(body: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    const src = body as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined) {
        out[key] = src[key];
      }
    }
    return out;
  }

  router.put("/:id/editor/gaps/:gapId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const config = getSupabaseRestConfig();
    if (!config) return res.status(500).json({ error: "Supabase config missing" });
    const patch = pickAllowedFields(req.body, ["state", "quote", "locator", "proposed_claim_id", "history"]);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    const table = new SupabaseTable(config, "project_evidence_items");
    await table.update(`evidence_id=eq.${encodeURIComponent(req.params.gapId)}&project_id=eq.${encodeURIComponent(record.projectId)}`, patch);
    res.json({ ok: true });
  }));

  router.put("/:id/editor/evidence/:evidenceId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const config = getSupabaseRestConfig();
    if (!config) return res.status(500).json({ error: "Supabase config missing" });
    const patch = pickAllowedFields(req.body, ["state", "quote", "locator", "proposed_claim_id", "history"]);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    const table = new SupabaseTable(config, "project_evidence_items");
    await table.update(`evidence_id=eq.${encodeURIComponent(req.params.evidenceId)}&project_id=eq.${encodeURIComponent(record.projectId)}`, patch);
    res.json({ ok: true });
  }));

  router.put("/:id/editor/claims/:claimId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const config = getSupabaseRestConfig();
    if (!config) return res.status(500).json({ error: "Supabase config missing" });
    const patch = pickAllowedFields(req.body, ["text", "draft_span_id", "status", "unsupported_reason", "unsupported_actor"]);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    const table = new SupabaseTable(config, "project_claims");
    await table.update(`claim_id=eq.${encodeURIComponent(req.params.claimId)}&project_id=eq.${encodeURIComponent(record.projectId)}`, patch);
    res.json({ ok: true });
  }));

  // Offline Sync Queue & Mutation Replay Endpoints
  router.post("/:id/sync", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { mutations, document, answers } = req.body ?? {};
    let updated = record;

    if (Array.isArray(mutations)) {
      for (const mut of mutations) {
        if (!mut || !mut.type || !mut.payload) continue;

        switch (mut.type) {
          case "approve_source": {
            const { sourceId, evidenceId, actor = currentUserId(req) } = mut.payload;
            const targetId = evidenceId || sourceId;
            if (targetId) {
              const item = updated.evidenceLedger.items.find(i => i.id === targetId || i.sourceId === targetId);
              if (item) {
                try {
                  updated.evidenceLedger = approveEvidence(updated.evidenceLedger, item.id, actor);
                } catch (_) {} // Ignore domain errors (e.g. already approved) during replay
              }
            }
            break;
          }
          case "reject_source": {
            const { sourceId, evidenceId, actor = currentUserId(req), reason } = mut.payload;
            const targetId = evidenceId || sourceId;
            if (targetId) {
              const item = updated.evidenceLedger.items.find(i => i.id === targetId || i.sourceId === targetId);
              if (item) {
                try {
                  updated.evidenceLedger = rejectEvidence(updated.evidenceLedger, item.id, actor, reason || "Rejected by user");
                } catch (_) {}
              }
            }
            break;
          }
          case "save_draft": {
            const draftDoc = mut.payload.document;
            const draftAns = mut.payload.answers;
            if (draftAns && typeof draftAns === "object") {
              updated = { ...updated, answers: { ...updated.answers, ...draftAns } };
            }
            if (draftDoc && isValidDocument(draftDoc)) {
              updated = { ...updated, document: draftDoc };
            }
            break;
          }
        }
      }
    } else {
      // Legacy fallback
      if (answers && typeof answers === "object") {
        updated = { ...updated, answers: { ...updated.answers, ...answers } };
      }
      if (document && isValidDocument(document)) {
        updated = { ...updated, document };
      }
    }

    // Recompute gates based on the final merged state
    updated.gates = recomputeG2(updated);
    if (updated.document && isValidDocument(updated.document)) {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(updated, updated.document);
      const gatesAfterG3 = recomputeG3({ ...updated, gates: gatesAfterG6 }, updated.document, updated.answers);
      updated.gates = recomputeG4({ ...updated, gates: gatesAfterG3 }, updated.document);
      updated.rubricReport = rubricReport;
    }

    const saved = await store.save(updated);
    res.json({ success: true, processed: Array.isArray(mutations) ? mutations.length : 1, project: projectView(saved) });
  }));

  router.post("/:id/draft", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { document, answers } = req.body ?? {};
    let updated = record;
    if (answers && typeof answers === "object") {
      updated = { ...updated, answers: { ...updated.answers, ...answers } };
    }
    if (document && isValidDocument(document)) {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(updated, document);
      const gatesAfterG3 = recomputeG3({ ...updated, gates: gatesAfterG6 }, document, updated.answers);
      const gates = recomputeG4({ ...updated, gates: gatesAfterG3 }, document);
      updated = { ...updated, document, rubricReport, gates };
    }
    const saved = await store.save(updated);
    res.json({ success: true, project: projectView(saved) });
  }));

  router.post("/:id/sources/approve", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { sourceId, evidenceId, actor = currentUserId(req) } = req.body ?? {};
    const targetId = evidenceId || sourceId;
    if (!targetId) {
      return res.status(400).json({ error: "Missing required field: sourceId or evidenceId" });
    }
    let evidenceLedger = record.evidenceLedger;
    if (evidenceLedger.items.some((i) => i.id === targetId || i.sourceId === targetId)) {
      const item = evidenceLedger.items.find((i) => i.id === targetId || i.sourceId === targetId)!;
      try {
        evidenceLedger = approveEvidence(evidenceLedger, item.id, actor);
      } catch (_) {}
    }
    const gates = recomputeG2({ ...record, evidenceLedger });
    const updated = await store.save({ ...record, evidenceLedger, gates });
    res.json({ success: true, project: projectView(updated) });
  }));

  router.post("/:id/sources/reject", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { sourceId, evidenceId, actor = currentUserId(req) } = req.body ?? {};
    const targetId = evidenceId || sourceId;
    if (!targetId) {
      return res.status(400).json({ error: "Missing required field: sourceId or evidenceId" });
    }
    let evidenceLedger = record.evidenceLedger;
    if (evidenceLedger.items.some((i) => i.id === targetId || i.sourceId === targetId)) {
      const item = evidenceLedger.items.find((i) => i.id === targetId || i.sourceId === targetId)!;
      try {
        evidenceLedger = rejectEvidence(evidenceLedger, item.id, actor, req.body?.reason || "Rejected by user");
      } catch (_) {}
    }
    const gates = recomputeG2({ ...record, evidenceLedger });
    const updated = await store.save({ ...record, evidenceLedger, gates });
    res.json({ success: true, project: projectView(updated) });
  }));

  app.use("/api/projects", router);
  registerSubmissionsRoutes(app, projectLimit);

    app.get("/api/atlas/output-types", projectLimit, (_req, res) => {
    const items = catalog.list().map((s) => ({
      id: s.id,
      label: s.label,
      aliases: s.aliases,
      family: s.family,
      academicLevels: s.academicLevels,
      typicalDisciplines: s.typicalDisciplines,
      available: isOutputTypeEnabled(s.id),
    }));
    res.json({ items });
  });

    app.get("/api/atlas/output-types/:id", projectLimit, (req, res) => {
    const spec = catalog.get(req.params.id);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${req.params.id}" in the catalog.` });
    }
    res.json(spec);
  });

    app.post("/api/projects", projectLimit, asyncRoute(async (req, res) => {
    const { outputTypeId } = req.body ?? {};
    if (typeof outputTypeId !== "string" || outputTypeId.length === 0) {
      return res.status(400).json({ error: "Missing required field: outputTypeId" });
    }
    const spec = catalog.get(outputTypeId);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${outputTypeId}" in the catalog.` });
    }
    if (!isOutputTypeEnabled(outputTypeId)) {
      // 403, not 404: the type genuinely exists in the catalog — it's just
      // not offered right now, a distinct condition from "doesn't exist".
      return res.status(403).json({ error: MAINTENANCE_MESSAGE });
    }
    const created = await store.create(outputTypeId, currentUserId(req));
    [...spec.intakeSchema.required, ...spec.intakeSchema.recommended].forEach(f => {
      if (f.allowsProvisional && created.answers[f.key] === undefined) {
        created.answers[f.key] = "provisional";
      }
    });
    // Compute every gate's real exit criteria immediately from the (still
    // empty) answers/journalRequirements/document/evidenceLedger/claimGraph,
    // rather than leaving domain/project/gates.ts's default empty
    // exitCriteria in place — an empty criteria list is vacuously "ready"
    // (isReadyToSignOff's `.every()` over zero items), which would let a
    // caller sign off before anything was ever computed.
    let gates = updateExitCriteria(created.gates, "G0", computeG0ExitCriteria(spec, created.answers));
    gates = recomputeG1({ ...created, gates }, created.answers, created.journalRequirements);
    gates = recomputeG2({ ...created, gates });
    gates = recomputeG3({ ...created, gates }, undefined, created.answers);
    gates = recomputeG4({ ...created, gates }, undefined);
    const record = await store.save({ ...created, gates });
    res.status(201).json(projectView(record));
  }));

    app.get("/api/projects", projectLimit, asyncRoute(async (req, res) => {
    const records = await store.listByOwner(currentUserId(req));
    res.json({ items: records.map((r) => projectView(r)) });
  }));

  app.get("/api/projects/:id", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(projectView(record));
  }));

  app.delete("/api/projects/:id", requireAuth, projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    await store.delete(record.projectId);
    res.json({ success: true, deleted: record.projectId });
  }));

    app.patch("/api/projects/:id", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { title, answers } = req.body ?? {};
    let nextAnswers = { ...record.answers };
    let hasChanges = false;

    if (typeof title === "string") {
      const cleanTitle = title.trim();
      if (cleanTitle) {
        nextAnswers.title = cleanTitle;
        nextAnswers.assignment_title = cleanTitle;
        hasChanges = true;
      }
    }

    if (answers && typeof answers === "object" && !Array.isArray(answers)) {
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v === "string") {
          nextAnswers[k] = v;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      const updated = await store.save({ ...record, answers: nextAnswers });
      return res.json(projectView(updated));
    }

    res.json(projectView(record));
  }));

    app.patch("/api/projects/:id/intake", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { answers } = req.body ?? {};
    if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
      return res.status(400).json({ error: "Missing required field: answers (object)" });
    }
    for (const value of Object.values(answers)) {
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean" &&
        (typeof value !== "object" || value === null)
      ) {
        return res.status(400).json({ error: "Every answer value must be JSON-serializable (string, number, boolean, or object)." });
      }
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const nextAnswers = { ...record.answers, ...(answers as Record<string, any>) };
    const criteria = computeG0ExitCriteria(spec, nextAnswers as any);

    try {
      let gates = updateExitCriteria(record.gates, "G0", criteria);
      gates = recomputeG1({ ...record, gates }, nextAnswers, record.journalRequirements);
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

  const userSavedAuthorsMap = new Map<string, any[]>();

    app.get("/api/user/saved-authors", requireAuth, projectLimit, asyncRoute(async (req, res) => {
    const userId = currentUserId(req);
    const authors = userSavedAuthorsMap.get(userId) || [];
    res.json({ authors });
  }));

    app.post("/api/user/saved-authors", requireAuth, projectLimit, asyncRoute(async (req, res) => {
    const userId = currentUserId(req);
    const { author } = req.body ?? {};
    if (!author) {
      return res.status(400).json({ error: "Missing author object" });
    }
    const current = userSavedAuthorsMap.get(userId) || [];
    const normalizedEmail = (author.email || "").trim().toLowerCase();
    const normalizedName = `${author.firstName || ""} ${author.surname || ""}`.trim().toLowerCase();

    const existingIdx = current.findIndex((a) => {
      if (author.id && a.id === author.id) return true;
      if (normalizedEmail && a.email && a.email.trim().toLowerCase() === normalizedEmail) return true;
      if (normalizedName) {
        const aName = `${a.firstName || ""} ${a.surname || ""}`.trim().toLowerCase();
        if (aName === normalizedName) return true;
      }
      return false;
    });

    if (existingIdx >= 0) {
      current[existingIdx] = { ...current[existingIdx], ...author };
    } else {
      current.unshift(author);
    }
    userSavedAuthorsMap.set(userId, current);
    res.json({ ok: true, authors: current });
  }));

    app.delete("/api/user/saved-authors/:authorId", requireAuth, projectLimit, asyncRoute(async (req, res) => {
    const userId = currentUserId(req);
    const { authorId } = req.params;
    const current = userSavedAuthorsMap.get(userId) || [];
    const next = current.filter((a) => a.id !== authorId && a.email !== authorId);
    userSavedAuthorsMap.set(userId, next);
    res.json({ ok: true, authors: next });
  }));

    app.put("/api/projects/:id/authors", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { authors } = req.body ?? {};
    if (!Array.isArray(authors)) {
      return res.status(400).json({ error: "Missing required field: authors (array)" });
    }

    // Validation
    const corresponding = authors.filter((a: any) => a.isCorresponding);
    if (corresponding.length > 1) {
      return res.status(400).json({ error: "Exactly one author can be designated as the corresponding author." });
    }

    // Automatically synchronize valid authors into user's saved author pool
    const userId = currentUserId(req);
    const userCurrent = userSavedAuthorsMap.get(userId) || [];
    for (const a of authors) {
      if (a && (a.firstName?.trim() || a.surname?.trim() || a.email?.trim())) {
        const normEmail = (a.email || "").trim().toLowerCase();
        const normName = `${a.firstName || ""} ${a.surname || ""}`.trim().toLowerCase();
        const idx = userCurrent.findIndex((ex) => {
          if (a.id && ex.id === a.id) return true;
          if (normEmail && ex.email && ex.email.trim().toLowerCase() === normEmail) return true;
          if (normName && `${ex.firstName || ""} ${ex.surname || ""}`.trim().toLowerCase() === normName) return true;
          return false;
        });
        if (idx >= 0) {
          userCurrent[idx] = { ...userCurrent[idx], ...a };
        } else {
          userCurrent.push(a);
        }
      }
    }
    userSavedAuthorsMap.set(userId, userCurrent);

    const updated = await store.save({ ...record, authors });
    res.json(projectView(updated));
  }));

    app.get("/api/projects/:id/journal-requirements", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.journalRequirements) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no journal requirements captured yet.` });
    }
    res.json(record.journalRequirements);
  }));

    app.put("/api/projects/:id/journal-requirements", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const requestedSource = (req.body as { source?: unknown } | undefined)?.source === "ai_extracted" ? "ai_extracted" : "manual";
    if (!isValidJournalRequirementsInput(req.body)) {
      return res.status(400).json({ error: "Invalid journal requirements payload." });
    }

    const journalRequirements: JournalRequirements = {
      ...req.body,
      source: requestedSource,
      capturedAt: new Date().toISOString(),
      capturedBy: currentUserId(req),
    };

    try {
      const gatesAfterG1 = recomputeG1(record, record.answers, journalRequirements);
      const recordAfterG1 = { ...record, journalRequirements, gates: gatesAfterG1 };
      const { rubricReport, gates } = record.document
        ? recomputeG6(recordAfterG1, record.document)
        : { rubricReport: record.rubricReport, gates: gatesAfterG1 };
      const updated = await store.save({ ...recordAfterG1, rubricReport, gates });
      res.json({ journalRequirements: updated.journalRequirements, gates: summarize(updated.gates), ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

    app.post("/api/projects/:id/journal-requirements/extract", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { guidelinesText, provider, apiKey, model } = req.body ?? {};

    if (typeof guidelinesText !== "string" || countWords(guidelinesText) < MIN_GUIDELINES_WORDS) {
      return res.status(400).json({
        error: `Missing or too-short field: guidelinesText (paste at least ${MIN_GUIDELINES_WORDS} words of the journal's own author guidelines).`,
      });
    }

    const baseInput = { guidelinesText, scopeId: record.projectId };


    try {
      const result = await extractJournalRequirements({
        ...baseInput,
        provider: typeof provider === "string" ? provider : undefined,
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        model: typeof model === "string" ? model : undefined,
      });
      return res.json({ proposal: result.proposal });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) {
          return res.status(428).json({ error: "consent_required", reason: err.message, provider });
        }
        return res.status(403).json({ error: "denied", reason: err.message });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  }));

    app.put("/api/projects/:id/document", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { document } = req.body ?? {};
    if (!isValidDocument(document)) {
      return res.status(400).json({ error: "Missing or malformed required field: document (CanonicalDocument — id, title, blocks[]: {id, kind, text})." });
    }

    try {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(record, document);
      const gatesAfterG3 = recomputeG3({ ...record, gates: gatesAfterG6 }, document, record.answers);
      const gates = recomputeG4({ ...record, gates: gatesAfterG3 }, document);
      const updated = await store.save({ ...record, document, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

    app.get("/api/projects/:id/document", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    res.json(record.document);
  }));

  app.get("/api/projects/:id/rubric", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.rubricReport) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    res.json(record.rubricReport);
  }));

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
    const rules = applyWaivers(compileRubricFromOutputType(spec, record.journalRequirements), record.waivers);
    if (!rules.some((r) => r.id === ruleId)) {
      return res.status(404).json({ error: `No rule "${ruleId}" for this project's output type.` });
    }

    try {
      const waivedRules = waiveRule(rules, ruleId, reason);
      const newWaiver = waivedRules.find((r) => r.id === ruleId)!.waived!;
      const waivers = { ...record.waivers, [ruleId]: newWaiver };
      const rubricReport = buildReport(waivedRules, record.document, record.claimGraph);
      const g6Gates = updateExitCriteria(record.gates, "G6", computeG6ExitCriteria(rubricReport));
      const gates = updateExitCriteria(g6Gates, "G7", computeG7ExitCriteria(record.document, rubricReport));
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

  registerManuscriptAndGateRoutes(app, store, projectLimit);
}
