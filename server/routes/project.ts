/**
 * Project / Atlas / Conductor API route.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md,
 *       docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * The second route built on the new architecture (after
 * server/routes/studio.ts). Exposes the Atlas catalog for intake-form
 * rendering, and the Conductor's gate state machine for a project bound to
 * one output type. Only G0 has a real, computable exit-criteria source
 * through this surface today (from Atlas intake answers) — G1-G5 and G7
 * have no requirement-extraction/sourcing/drafting/review/export pipeline
 * to compute criteria from yet (docs 30 §10), and G6 (the Rubric) needs a
 * CanonicalDocument, which has no storage/editor surface yet either
 * (docs 13 §8.1). The sign-off and invalidate endpoints below are
 * gate-agnostic — they will work for any gate the moment something else in
 * the system starts calling updateExitCriteria for it — but in practice
 * only G0 can reach "ready" through this API right now.
 *
 * See src/app/conductor/projectStore.ts for the scope note on project
 * persistence.
 */

import express from "express";
import { catalog } from "../../src/app/atlas/atlas.ts";
import {
  computeG0ExitCriteria,
  updateExitCriteria,
  signOff,
  invalidateGate,
  summarize,
  GATE_ORDER,
  GateTransitionError,
} from "../../src/app/conductor/conductor.ts";
import type { GateId } from "../../src/app/conductor/conductor.ts";
import { createProject, getProject, saveProject } from "../../src/app/conductor/projectStore.ts";

function isGateId(value: unknown): value is GateId {
  return typeof value === "string" && (GATE_ORDER as string[]).includes(value);
}

function projectView(record: ReturnType<typeof getProject>) {
  if (!record) return undefined;
  return {
    projectId: record.projectId,
    outputTypeId: record.outputTypeId,
    answers: record.answers,
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
   * Sign off a gate. Body: { actor }. 409s if the gate is not ready (a
   * blocking exit criterion is unsatisfied, or entry prerequisites are
   * unmet). The approved snapshot is the project's intake answers, which is
   * only meaningful for G0 today — see this file's module comment.
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

    try {
      const gates = await signOff(record.gates, req.params.gate, actor, { answers: record.answers });
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
