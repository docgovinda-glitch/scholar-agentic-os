import express from "express";
import crypto from "crypto";
import { asyncRoute, loadOwnedProject, getSharedStore } from "../project.ts";
import { addSubmission, updateSubmission, deleteSubmission, SubmissionError } from "../../../src/domain/submission/submissions.ts";
import { SUBMISSION_STATUSES } from "../../../src/domain/submission/types.ts";
import type { SubmissionRecord } from "../../../src/domain/submission/types.ts";
import { NewSubmissionSchema, SubmissionPatchSchema } from "../../../src/domain/schemas/projectSchemas.ts";

export function registerSubmissionsRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  const store = getSharedStore();

  /** Every submission attempt recorded against the project. */
  app.get("/api/projects/:id/submissions", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ submissions: record.submissions });
  }));

  /** Record a new submission attempt. */
  app.post("/api/projects/:id/submissions", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    
    if (!NewSubmissionSchema.safeParse(req.body).success) {
      return res.status(400).json({
        error:
          "Missing or malformed submission. Required: journalName (string), submittedAt (string), status (one of: " +
          `${SUBMISSION_STATUSES.join(", ")}). Optional: journalUrl, journalSubmissionId, notes (strings).`,
      });
    }
    const now = new Date().toISOString();
    const submission: SubmissionRecord = { ...req.body, id: `sub-${crypto.randomUUID()}`, statusUpdatedAt: now };
    const submissions = addSubmission(record.submissions, submission);
    const updated = await store.save({ ...record, submissions });
    res.status(201).json({ submissions: updated.submissions });
  }));

  /** Patch a submission's fields. */
  app.patch("/api/projects/:id/submissions/:submissionId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    
    if (!SubmissionPatchSchema.safeParse(req.body).success) {
      return res.status(400).json({
        error: `Malformed submission patch. Allowed fields: journalName, journalUrl, submittedAt, status (one of: ${SUBMISSION_STATUSES.join(", ")}), journalSubmissionId, notes.`,
      });
    }
    try {
      const submissions = updateSubmission(record.submissions, req.params.submissionId, req.body, new Date().toISOString());
      const updated = await store.save({ ...record, submissions });
      res.json({ submissions: updated.submissions });
    } catch (err) {
      if (err instanceof SubmissionError) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** Delete a submission record. */
  app.delete("/api/projects/:id/submissions/:submissionId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    try {
      const submissions = deleteSubmission(record.submissions, req.params.submissionId);
      const updated = await store.save({ ...record, submissions });
      res.json({ submissions: updated.submissions });
    } catch (err) {
      if (err instanceof SubmissionError) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }));
}
