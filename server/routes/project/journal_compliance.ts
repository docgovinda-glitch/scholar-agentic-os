import express from "express";
import { asyncRoute, loadOwnedProject, getSharedStore } from "../project.ts";
import { buildReport, compileRubricFromOutputType } from "../../../src/app/rubric/rubric.ts";
import { catalog } from "../../../src/app/atlas/atlas.ts";

/**
 * Exposes a dedicated pipeline for checking a manuscript against known Journal
 * Guidelines (word limits, section requirements, citation styles) that were 
 * captured during Phase 1. 
 */
export function journalComplianceRouter(projectLimit: express.RequestHandler): express.Router {
  const router = express.Router({ mergeParams: true });
  const store = getSharedStore();

  const evaluateJournalCompliance = asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    if (!record.journalRequirements) {
      return res.status(400).json({
        error: "Project has no journal requirements captured.",
      });
    }

    if (!record.document) {
      return res.status(400).json({
        error: "Project has no document to evaluate.",
      });
    }

    // Compile rules based on output type and venue requirements
    const rules = compileRubricFromOutputType(catalog.getOrThrow(record.outputTypeId), record.journalRequirements);
    
    // Evaluate the document against the compiled rubric
    const report = buildReport(rules, record.document);
    
    res.json({ report });
  });

  router.get("/", projectLimit, evaluateJournalCompliance);
  router.get("/journal-compliance-report", projectLimit, evaluateJournalCompliance);
  return router;
}
