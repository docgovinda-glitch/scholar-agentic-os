import express from "express";
import { 
  asyncRoute, 
  loadOwnedProject, 
  getSharedStore, 
  projectView, 
  saveClaimGraphChange, 
  recomputeG4 
} from "../project.ts";
import { 
  addClaim, 
  bindEvidence, 
  removeSource, 
  unsupportedClaims, 
  findConflicts, 
  claimsDependingOnSource, 
  markClaimUnsupported, 
  ClaimGraphError 
} from "../../../src/domain/claim/graph.ts";
import { ClaimSchema, ClaimEvidenceBindingSchema } from "../../../src/domain/schemas/projectSchemas.ts";
import type { Claim, ClaimEvidenceBinding } from "../../../src/domain/claim/types.ts";
import { GateTransitionError } from "../../../src/app/conductor/conductor.ts";
import { syncClaimToRelational, syncBindingToRelational, deleteSourceFromRelational } from "../../src/syncRelational.ts";

function isValidClaim(value: unknown): value is Claim {
  return ClaimSchema.safeParse(value).success;
}

function isValidBinding(value: unknown): value is ClaimEvidenceBinding {
  return ClaimEvidenceBindingSchema.safeParse(value).success;
}

export function claimsRouter(projectLimit: express.RequestHandler): express.Router {
  const router = express.Router({ mergeParams: true });
  const store = getSharedStore();

  router.post("/", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { claim } = req.body ?? {};
    if (!isValidClaim(claim)) {
      return res.status(400).json({ error: "Missing or malformed required field: claim ({id, text, draftSpanId?})." });
    }
    try {
      const claimGraph = addClaim(record.claimGraph, claim);
      const updated = await saveClaimGraphChange(store, record, claimGraph);
      await syncClaimToRelational(updated.projectId, claim);
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

  router.post("/:claimId/evidence", projectLimit, asyncRoute(async (req, res) => {
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
      const updated = await saveClaimGraphChange(store, record, claimGraph);
      await syncBindingToRelational(updated.projectId, binding);
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

  router.post("/:claimId/mark-unsupported", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { reason, actor } = req.body ?? {};
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    try {
      const claimGraph = markClaimUnsupported(record.claimGraph, req.params.claimId, reason, actor);
      const gates = recomputeG4({ ...record, claimGraph }, record.document);
      const updated = await store.save({ ...record, claimGraph, gates });
      const updatedClaim = updated.claimGraph.claims.find(c => c.id === req.params.claimId);
      if (updatedClaim) await syncClaimToRelational(updated.projectId, updatedClaim);
      res.json({ ...projectView(updated), claimGraph: updated.claimGraph });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  router.get("/", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.claimGraph);
  }));

  router.get("/unsupported", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: unsupportedClaims(record.claimGraph) });
  }));

  router.get("/conflicts", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ conflicts: findConflicts(record.claimGraph) });
  }));

  router.get("/api/projects/:id/sources/:sourceId/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: claimsDependingOnSource(record.claimGraph, req.params.sourceId) });
  }));

  router.delete("/api/projects/:id/sources/:sourceId", projectLimit, asyncRoute(async (req, res) => {
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
  return router;
}
