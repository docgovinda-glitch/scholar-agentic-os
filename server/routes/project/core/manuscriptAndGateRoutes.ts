import express from "express";
import { requestCompleter } from "../../../src/ai/browserHandoff.ts";
import { sendAiFailure, BrowserAiRequiredError } from "../../../src/ai/aiRouteErrors.ts";
import { catalog } from "../../../../src/app/atlas/atlas.ts";
import {
  computeG4ExitCriteria,
  computeG5ExitCriteria,
  updateExitCriteria,
  signOff,
  invalidateGate,
  summarize,
  GATE_ORDER,
  GateTransitionError,
} from "../../../../src/app/conductor/conductor.ts";
import type { ProjectStore } from "../../../../src/services/store/types.ts";
import { exportDocument } from "../../../../src/app/export/export.ts";
import { layoutFrom } from "../../../../src/domain/journal/wordLayouts.ts";
import type { ExportFormat } from "../../../../src/app/export/types.ts";
import { safeParseAnswerField } from "../../../../src/shared/projectStateSchema";
import { manuscriptToCanonicalDocument } from "../agentic";
import { emptyDocument } from "../../../../src/domain/document/model.ts";
import { allocateWordBudget } from "../../../../src/domain/manuscript/wordBudget.ts";
import type { GeneratedSection } from "../../../../src/domain/manuscript/types.ts";
import {
  startJob,
  nextSection as nextPlannedSection,
  appendSection,
  failJob,
  resumeJob,
  pauseJob,
  GenerationJobError,
} from "../../../../src/domain/manuscript/stateMachine.ts";
import { generateSection } from "../../../../src/app/manuscript/generate.ts";
import { checkCoherence } from "../../../../src/app/coherence/checkCoherence.ts";
import type { CoherenceDimension } from "../../../../src/domain/coherence/types.ts";
import { COHERENCE_DIMENSIONS } from "../../../../src/domain/coherence/types.ts";
import { runPeerReview } from "../../../../src/app/review/peerReview.ts";
import type { ReviewLens } from "../../../../src/domain/review/types.ts";
import { REVIEW_LENSES } from "../../../../src/domain/review/types.ts";
import { generateCoverLetter } from "../../../../src/app/coverLetter/generateCoverLetter.ts";
import { proposeAnonymization } from "../../../../src/app/anonymization/proposeAnonymization.ts";
import { applyAnonymization, AnonymizationApplyError } from "../../../../src/app/anonymization/applyAnonymization.ts";
import { resolveCitations, isKnownCitationStyle, knownCitationStyleIds } from "../../../../src/app/citation/resolveCitations.ts";
import { withProjectLock } from "../../../src/concurrency/projectLock.ts";
import {
  isGateId,
  buildSectionContextPacket,
  recomputeG3,
  recomputeG4,
  recomputeG6,
  projectView,
  currentUserId,
  loadOwnedProject,
  asyncRoute,
} from "./projectHelpers.ts";

export function registerManuscriptAndGateRoutes(
  app: express.Express,
  store: ProjectStore,
  projectLimit: express.RequestHandler
): void {
  /**
   * The long-form generation engine (domain/manuscript, src/app/manuscript/
   * generate.ts). Never one giant model call: each request below generates
   * at most ONE section, checkpointed immediately (store.save persists the
   * updated job before the response returns), so the job is durably resumable
   * across a refresh, a server restart, or a failed request — a caller just
   * calls .../next-section again and it continues from job.sections.length,
   * never replaying or re-charging for a section already completed.
   */

  /** The current generation job, if one has been started. 404s otherwise. */
  app.get("/api/projects/:id/manuscript/job", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.generationJob) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
    }
    res.json(record.generationJob);
  }));

  /**
   * Plan and start a new generation job from the project's output type
   * (Atlas structure + word budget) and captured journal requirements
   * (a venue-specific word limit overrides the catalog's generic one). Only
   * the sections the catalog marks countsTowardWordcount are planned — see
   * domain/manuscript/wordBudget.ts's own comment on why title/declarations/
   * references/etc. are out of scope for this engine. 409s if a job already
   * exists — there is no implicit reset; discarding a job with completed
   * sections needs to be a deliberate, visible action, which this phase does
   * not build a route for yet.
   */
  app.post("/api/projects/:id/manuscript/start", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (record.generationJob) {
      return res.status(409).json({ error: "A generation job already exists for this project." });
    }
    const spec = catalog.getOrThrow(record.outputTypeId);
    const plan = allocateWordBudget(spec.structure.sections, spec.budget, record.journalRequirements?.wordLimit?.max);
    if (plan.length === 0) {
      return res.status(400).json({ error: "This output type has no sections the generation engine can plan for." });
    }
    const totalWordTarget =
      record.journalRequirements?.wordLimit?.max ??
      spec.budget.totalWords.typical ??
      Math.round((spec.budget.totalWords.min + spec.budget.totalWords.max) / 2);
    const generationJob = startJob(plan, totalWordTarget);
    const updated = await store.save({ ...record, generationJob });
    res.status(201).json(updated.generationJob);
  }));

  /**
   * Generate exactly the next planned section and append it to the job —
   * the actual checkpoint. Body: { provider?, apiKey?, model?? },
   * same BYOK-vs-Premium shape as every other AI-backed route in this file.
   * Drafting is content-bearing (platform/warden/classify.ts), so a BYOK
   * call here goes through the same session-scoped consent flow Studio uses
   * — POST /api/studio/consent with sessionId `manuscript:<projectId>`
   * grants it, exactly the same generic mechanism, not a new one.
   */
  /**
   * The whole handler runs inside withProjectLock (server/src/concurrency/
   * projectLock.ts): this is a read-AI call-append-save sequence against
   * store.save()'s blind last-write-wins UPSERT, so two overlapping
   * requests for the same project (double-tab, or a stale in-flight
   * request racing a reload-and-retry) must never both read the same
   * starting sections.length and have one silently clobber the other's
   * freshly-generated (real-money) section. Loading the record INSIDE the
   * lock, not before it, is what makes this correct — a second request
   * only starts once the first has fully saved, so it sees the first
   * request's section already appended and generates the next one, never
   * the same one again.
   */
  app.post("/api/projects/:id/manuscript/next-section", projectLimit, asyncRoute(async (req, res) => {
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.generationJob) {
        return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
      }
      if (record.generationJob.state === "completed") {
        return res.status(409).json({ error: "This generation job already completed — nothing left to generate." });
      }
      const planned = nextPlannedSection(record.generationJob);
      if (!planned) {
        return res.status(409).json({ error: "Every planned section is already generated." });
      }

      const packet = buildSectionContextPacket(record, planned);

      async function checkpoint(generatedSection: Awaited<ReturnType<typeof generateSection>>["section"]) {
        const generationJob = appendSection(record!.generationJob!, generatedSection);
        return store.save({ ...record!, generationJob });
      }


      try {
        const result = await generateSection({
          packet,
        complete: requestCompleter(req),
        });
        const updated = await checkpoint(result.section);
        return res.json({ generationJob: updated.generationJob });
      } catch (err) {
        // A browser hand-off is not a failure: the job stays as it was until the browser answers.
        if (err instanceof BrowserAiRequiredError) return sendAiFailure(res, err, "Section generation");
        const message = err instanceof Error ? err.message : "Unknown error";
        const generationJob = failJob(record.generationJob, message);
        await store.save({ ...record, generationJob });
        return sendAiFailure(res, err, "Section generation");
      }
    });
  }));

  /** Pause a running job — a deliberate human-in-the-loop checkpoint, not an error state. */
  app.post("/api/projects/:id/manuscript/pause", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.generationJob) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
    }
    try {
      const generationJob = pauseJob(record.generationJob);
      const updated = await store.save({ ...record, generationJob });
      res.json(updated.generationJob);
    } catch (err) {
      if (err instanceof GenerationJobError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  /** Resume a paused or failed job — sets it back to "running"; the next actual generation happens via .../next-section, continuing from job.sections.length. */
  app.post("/api/projects/:id/manuscript/resume", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.generationJob) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
    }
    try {
      const generationJob = resumeJob(record.generationJob);
      const updated = await store.save({ ...record, generationJob });
      res.json(updated.generationJob);
    } catch (err) {
      if (err instanceof GenerationJobError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  /**
   * The global coherence pass (domain/coherence) over every section
   * generated so far — multi-pass (up to 3 separate model calls, one per
   * CoherenceDimension), never one call asked to judge the whole
   * manuscript's consistency at once. Body:
   * { provider?, apiKey?, model??, dimensions? }. `dimensions`
   * lets a caller re-run just one failed pass instead of all three. Stores
   * the result on the job (coherenceReport) so it survives a refresh, same
   * as everything else this engine checkpoints.
   */
  app.post("/api/projects/:id/manuscript/coherence-check", projectLimit, asyncRoute(async (req, res) => {
    // See next-section's comment above on withProjectLock — same
    // read-AI call-save race, same fix.
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.generationJob) {
        return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
      }
      const { dimensions } = req.body ?? {};
      if (dimensions !== undefined && (!Array.isArray(dimensions) || !dimensions.every((d) => COHERENCE_DIMENSIONS.includes(d)))) {
        return res.status(400).json({ error: `Invalid field: dimensions. Must be a subset of: ${COHERENCE_DIMENSIONS.join(", ")}` });
      }

      const sections = record.generationJob.sections;

      async function saveReport(coherenceReport: Awaited<ReturnType<typeof checkCoherence>>) {
        const generationJob = { ...record!.generationJob!, coherenceReport };
        return store.save({ ...record!, generationJob });
      }


      try {
        const coherenceReport = await checkCoherence({
          sections,
        complete: requestCompleter(req),
          dimensions,
        });
        const updated = await saveReport(coherenceReport);
        return res.json({ generationJob: updated.generationJob });
      } catch (err) {
        return sendAiFailure(res, err, "This step");
      }
    });
  }));

  /**
   * Multi-lens adversarial peer review (domain/review) over every section
   * generated so far — up to seven separate model calls, one per
   * ReviewLens, each instructed to be genuinely critical rather than
   * praise-optimized. Body: { provider?, apiKey?, model??,
   * lenses? }. Every call APPENDS a new round to peerReviewHistory.rounds —
   * never overwrites a prior one, so an author can compare round N against
   * round N-1 after revising. `lenses` lets a caller re-run just one failed
   * lens as its own new round rather than the whole panel.
   */
  app.post("/api/projects/:id/manuscript/peer-review", projectLimit, asyncRoute(async (req, res) => {
    // See next-section's comment above on withProjectLock — same
    // read-AI call-save race, same fix.
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.generationJob) {
        return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
      }
      const { lenses } = req.body ?? {};
      if (lenses !== undefined && (!Array.isArray(lenses) || !lenses.every((l) => REVIEW_LENSES.includes(l)))) {
        return res.status(400).json({ error: `Invalid field: lenses. Must be a subset of: ${REVIEW_LENSES.join(", ")}` });
      }

      const sections = record.generationJob.sections;
      const roundNumber = record.peerReviewHistory.rounds.length + 1;
      const journalRequirements = record.journalRequirements ? { journalName: record.journalRequirements.journalName } : undefined;

      async function saveRound(round: Awaited<ReturnType<typeof runPeerReview>>) {
        const peerReviewHistory = { rounds: [...record!.peerReviewHistory.rounds, round] };
        const gates = updateExitCriteria(record!.gates, "G5", computeG5ExitCriteria(peerReviewHistory));
        return store.save({ ...record!, peerReviewHistory, gates });
      }


      try {
        const round = await runPeerReview({
          sections,
          roundNumber,
          journalRequirements,
        complete: requestCompleter(req),
          lenses,
        });
        const updated = await saveRound(round);
        return res.json({ peerReviewHistory: updated.peerReviewHistory, gates: summarize(updated.gates) });
      } catch (err) {
        if (err instanceof GateTransitionError) return res.status(409).json({ error: err.message });
        return sendAiFailure(res, err, "This step");
      }
    });
  }));

  /** Every peer review round run so far (domain/review), most recent last — versioned, never overwritten. */
  app.get("/api/projects/:id/manuscript/peer-review", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.peerReviewHistory);
  }));

  /**
   * Resolve every `[ev-xxxx]` bracket-id currently in the document into a
   * real in-text citation, and (re)build the "references" section from the
   * same evidence — src/app/citation/resolveCitations.ts, closing the gap
   * between the manuscript engine's citation convention and the seven real
   * citation-compliance formatters (APA 7, MLA 9, Chicago author-date,
   * Chicago Notes-Bibliography, Harvard, IEEE, Vancouver). Deterministic,
   * no model call, so no BYOK/Premium split. Body: { style? } — defaults to
   * the captured journal's citationStyle, falling back to the catalog's
   * own default (same precedent as fromAtlas.ts's
   * compileCitationStyleGateRules). 400s for an unrecognised style id. A
   * document with no remaining bracket-ids is a safe no-op (returns
   * citedSourceIds: [] unchanged) — see resolveCitations.ts's own comment
   * for why this is deliberately a run-once-near-the-end action, not
   * something to call after every section.
   */
  app.post("/api/projects/:id/manuscript/resolve-citations", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot resolve citations for a project with no document submitted yet." });
    }
    const spec = catalog.getOrThrow(record.outputTypeId);
    const { style } = req.body ?? {};
    const styleId = typeof style === "string" && style.length > 0 ? style : (record.journalRequirements?.citationStyle ?? spec.citation.defaultStyle);
    if (!isKnownCitationStyle(styleId)) {
      return res.status(400).json({ error: `Unknown citation style "${styleId}". Known styles: ${knownCitationStyleIds().join(", ")}.` });
    }

    const { document, citedSourceIds, unresolvedIds } = resolveCitations(record.document, record.evidenceLedger, styleId);

    try {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(record, document);
      const gatesAfterG3 = recomputeG3({ ...record, gates: gatesAfterG6 }, document, record.answers);
      const gates = recomputeG4({ ...record, gates: gatesAfterG3 }, document);
      const updated = await store.save({ ...record, document, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport, citedSourceIds, unresolvedIds });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Generate a cover letter (docs 33-EXPORT-ARCHITECTURE.md §7: "Cover
   * letter | Journal submissions") from the project's document and its
   * captured journal requirements. A single bounded model call, unlike the
   * manuscript engine's per-section checkpointing — there is no
   * cross-call state to persist. Overwrites any previous cover letter
   * (domain/coverLetter — one per project, not a version history). Body:
   * { provider?, apiKey?, model?? }, same BYOK-vs-Premium shape
   * and 428/403/402 status mapping as every other AI-backed route here.
   */
  app.post("/api/projects/:id/cover-letter", projectLimit, asyncRoute(async (req, res) => {
    // See next-section's comment on withProjectLock — same read-AI
    // call-save shape, so the same overlapping-request risk applies (here:
    // one request's real AI call gets its result silently discarded by
    // another's save, wasting credits, even though overwriting an old
    // cover letter is itself expected behavior).
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.document) {
        return res.status(400).json({ error: "Cannot generate a cover letter for a project with no document submitted yet." });
      }
      if (!record.journalRequirements) {
        return res.status(400).json({ error: "Cannot generate a cover letter before journal requirements are captured (the target journal is what the letter is addressed to)." });
      }
      const document = record.document;
      const journalRequirements = record.journalRequirements;


      try {
        const { coverLetter } = await generateCoverLetter({
          document,
          journalRequirements,
        complete: requestCompleter(req),
        });
        const updated = await store.save({ ...record, coverLetter });
        return res.json({ coverLetter: updated.coverLetter });
      } catch (err) {
        return sendAiFailure(res, err, "This step");
      }
    });
  }));

  /** The most recently generated cover letter. 404s if none has been generated yet. */
  app.get("/api/projects/:id/cover-letter", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.coverLetter) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no cover letter generated yet.` });
    }
    res.json(record.coverLetter);
  }));

  /**
   * Propose anonymization redactions (docs 33-EXPORT-ARCHITECTURE.md §7.1)
   * over the project's document — author names/affiliations,
   * acknowledgements, funding statements naming the team, and
   * identity-revealing self-citations. Proposals only: nothing here is
   * applied to any document. Overwrites any previous proposal report
   * (domain/anonymization — one report per project, superseded on
   * regeneration, same as coverLetter). Body: { provider?, apiKey?,
   * model?? }, same BYOK-vs-Premium shape as every other
   * AI-backed route here.
   */
  app.post("/api/projects/:id/anonymization/propose", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot propose anonymization for a project with no document submitted yet." });
    }
    const document = record.document;


    try {
      const anonymizationReport = await proposeAnonymization({
        document,
        complete: requestCompleter(req),
      });
      const updated = await store.save({ ...record, anonymizationReport });
      return res.json({ anonymizationReport: updated.anonymizationReport });
    } catch (err) {
      return sendAiFailure(res, err, "This step");
    }
  }));

  /** The most recent anonymization proposal report and the anonymized document (if one has been produced), both null until they exist. */
  app.get("/api/projects/:id/anonymization", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ report: record.anonymizationReport ?? null, anonymizedDocument: record.anonymizedDocument ?? null });
  }));

  /**
   * Apply a human-accepted subset of the most recent anonymization
   * proposals (docs 33 §7.1: "Every change is shown for review before the
   * anonymised file is produced") — deterministic, no model call. Body:
   * { acceptedIndexes: number[] }, each an index into the most recent
   * anonymizationReport.proposals. Writes the result to
   * `anonymizedDocument`, a separate field from `document` — the source
   * document is never overwritten by an anonymized copy. 409s if a
   * proposal's original text is no longer present (the document changed
   * since the proposal was generated — re-run propose first).
   */
  app.post("/api/projects/:id/anonymization/apply", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot apply anonymization to a project with no document submitted yet." });
    }
    if (!record.anonymizationReport || record.anonymizationReport.proposals.length === 0) {
      return res.status(400).json({ error: "No anonymization proposals to apply — run POST .../anonymization/propose first." });
    }
    const { acceptedIndexes } = req.body ?? {};
    const proposals = record.anonymizationReport.proposals;
    if (
      !Array.isArray(acceptedIndexes) ||
      acceptedIndexes.length === 0 ||
      !acceptedIndexes.every((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < proposals.length)
    ) {
      return res.status(400).json({ error: `Missing or invalid field: acceptedIndexes (array of integers, each 0–${proposals.length - 1}).` });
    }

    const accepted = (acceptedIndexes as number[]).map((i) => proposals[i]);
    try {
      const anonymizedDocument = applyAnonymization(record.document, accepted);
      const updated = await store.save({ ...record, anonymizedDocument });
      res.json({ anonymizedDocument: updated.anonymizedDocument });
    } catch (err) {
      if (err instanceof AnonymizationApplyError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Sign off a gate. Body: { actor }. 409s if the gate is not ready (a
   * blocking exit criterion is unsatisfied, or entry prerequisites are
   * unmet). The approved snapshot is what a later content change is
   * detected against (docs 30 §2.2) — G0's is the intake answers, G1's is
   * the intake answers plus the journal requirements, G2's is the evidence
   * ledger plus any recorded smaller-corpus override, G3's is the
   * document's block ids plus the intake answers, G4's is the document's
   * block ids plus the claim graph, G5's is the peer-review history, G6's
   * is the Rubric report, G7's is that same Rubric report plus the
   * document's block ids; every gate now has real computed content to
   * snapshot.
   */
  app.post("/api/projects/:id/gates/:gate/signoff", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { actor, chapterId } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }

    const approvedSnapshot: unknown =
      req.params.gate === "G0"
        ? { answers: record.answers }
        : req.params.gate === "G1"
          ? { answers: record.answers, journalRequirements: record.journalRequirements }
          : req.params.gate === "G2"
            ? { evidenceLedger: record.evidenceLedger, sourceCountOverride: record.sourceCountOverride }
            : req.params.gate === "G3"
              ? { blockIds: record.document?.blocks.map((b) => b.id) ?? [], answers: record.answers }
              : req.params.gate === "G4"
                ? { blockIds: record.document?.blocks.map((b) => b.id) ?? [], claimGraph: record.claimGraph }
                : req.params.gate === "G5"
                  ? { peerReviewHistory: record.peerReviewHistory }
                  : req.params.gate === "G6"
                    ? { rubricReport: record.rubricReport }
                    : req.params.gate === "G7"
                      ? { rubricReport: record.rubricReport, blockIds: record.document?.blocks.map((b) => b.id) ?? [] }
                      : {};

    try {
      const gates = await signOff(record.gates, req.params.gate, actor, approvedSnapshot, chapterId);
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
   */
  const exportHandler = asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    // The journal workspace sends its manuscript with citations already
    // rendered in the chosen style; it takes the place of the stored text.
    const supplied =
      typeof req.body?.manuscriptMarkdown === "string" && req.body.manuscriptMarkdown.trim() ? (req.body.manuscriptMarkdown as string) : null;

    // Synthesize document if missing but manuscript draft is present in answers
    let documentToExport = supplied
      ? manuscriptToCanonicalDocument(
          record.projectId,
          record.answers?.["working_title"] || (record as { title?: string }).title || "Manuscript",
          supplied
        )
      : record.document;
    if (!documentToExport) {
      const rawManuscript =
        record.answers?.["manuscript_markdown"] ||
        record.answers?.["full_text_markdown"] ||
        record.answers?.["assembled_draft"] ||
        record.answers?.["manuscript_draft"];
      if (rawManuscript) {
        documentToExport = manuscriptToCanonicalDocument(
          record.projectId,
          record.answers?.["working_title"] || (record as { title?: string }).title || "Manuscript",
          rawManuscript
        );
      }
    }

    if (!documentToExport) {
      return res.status(400).json({ error: "Cannot export a project with no document submitted yet." });
    }

    const rawFormat = req.params?.format || req.body?.format || req.query?.format;
    const format = typeof rawFormat === "string" ? rawFormat.toLowerCase() : "";
    const validFormats = [
      "docx",
      "odt",
      "pdf",
      "latex",
      "typst",
      "camera_ready_pdf",
      "markdown",
      "md",
      "rebuttal_letter",
      "rebuttal-letter",
    ];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid export format. Must be one of: ${validFormats.join(", ")}` });
    }

    if (format === "markdown" || format === "md") {
      let mdContent =
        supplied ||
        record.answers?.["manuscript_markdown"] ||
        record.answers?.["full_text_markdown"] ||
        documentToExport.blocks.map((b) => b.text).join("\n\n");

      const title = record.answers?.["working_title"] || (record as { title?: string }).title || "Manuscript";
      if (!mdContent.startsWith("# ")) {
        mdContent = `# ${title}\n\n` + mdContent;
      }

      const includeRebuttal = req.body?.includeRebuttalAppendix ?? req.query?.includeRebuttalAppendix;
      if (includeRebuttal && record.answers?.["rebuttal_matrix"]) {
        const matrix = safeParseAnswerField<any[]>(record.answers["rebuttal_matrix"], []);
        if (Array.isArray(matrix) && matrix.length > 0) {
          mdContent += "\n\n## APPENDIX: POINT-BY-POINT REFEREE REBUTTAL MATRIX\n\n";
          matrix.forEach((item: { refereeRole?: string; referee?: string; lens?: string; section?: string; critiqueSummary?: string; critique?: string; authorResponse?: string; revisionAction?: string }, idx: number) => {
            mdContent += `### Item ${idx + 1}: ${item.refereeRole || item.referee || "Referee Critique"} (${item.lens || item.section || "General"})\n`;
            mdContent += `**Critique**: ${item.critiqueSummary || item.critique || ""}\n\n`;
            mdContent += `**Author Response**: ${item.authorResponse || "[not yet written]"}\n\n`;
            mdContent += `**Revision Action**: ${item.revisionAction || "[not yet written]"}\n\n`;
          });
        }
      }

      const buffer = Buffer.from(mdContent, "utf-8");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md"`
      );
      res.setHeader("Content-Length", buffer.length);
      return res.send(buffer);
    }

    try {
      const template = req.body?.template || req.query?.template;
      const targetFormat = (format === "pdf" && template) ? "camera_ready_pdf" : (format as ExportFormat);

      let rebuttalMatrix: Array<{ referee: string; lens?: string; section?: string; severity?: string; critique: string; authorResponse: string; revisionAction?: string }> | undefined = undefined;
      if (record.answers?.["rebuttal_matrix"]) {
        const parsed = safeParseAnswerField<any[]>(record.answers["rebuttal_matrix"], []);
        if (Array.isArray(parsed)) rebuttalMatrix = parsed;
      }

      const result = await exportDocument({
        document: documentToExport,
        format: targetFormat,
        title: documentToExport.title,
        author: record.authors?.[0] ? `${record.authors[0].firstName} ${record.authors[0].surname}`.trim() : "",
        academicOptions: {
          template: (template as any) || "apa7",
          runningHead: req.body?.runningHead || req.query?.runningHead || record.answers?.["running_head"],
          authorAffiliation: req.body?.affiliation || req.query?.affiliation || record.authors?.[0]?.affiliation,
          authorEmail: req.body?.email || req.query?.email || record.authors?.[0]?.email,
          authorOrcid: req.body?.orcid || req.query?.orcid || record.answers?.["author_orcid"],
          authors: record.authors && record.authors.length > 0
            ? record.authors.map((a, i) => ({
                name: `${a.firstName} ${a.surname}`.trim(),
                affiliation: a.affiliation,
                email: a.email,
                orcid: a.orcid,
                // The author marked corresponding; the first one only when none is.
                isCorresponding: a.isCorresponding || (i === 0 && !record.authors!.some((x) => x.isCorresponding)),
              }))
            : undefined,
          keywords: req.body?.keywords || (record.answers?.["keywords"] ? record.answers["keywords"].split(",").map((s: string) => s.trim()) : undefined),
          abstractText: record.answers?.["abstract"] || record.answers?.["abstract_text"],
          lineSpacing: req.body?.lineSpacing ? (Number(req.body.lineSpacing) as 1.15 | 1.5 | 2.0) : 2.0,
          wordLayout: layoutFrom(req.body?.layout, req.body?.lineNumbers),
          journalName: typeof record.answers?.["target_journal"] === "string" ? record.answers["target_journal"] : undefined,
          ethicalDeclarations: {
            dataAvailability: record.answers?.["data_availability_statement"],
            competingInterests: record.answers?.["competing_interests_statement"],
            funding: record.answers?.["funding_statement"],
            authorContributions: record.answers?.["credit_statement"],
            aiDisclosure: record.answers?.["ai_disclosure_statement"],
          },
          rebuttalMatrix,
          includeRebuttalAppendix: Boolean(req.body?.includeRebuttalAppendix ?? req.query?.includeRebuttalAppendix),
        },
      });

      if (format === "pdf" || format === "camera_ready_pdf") {
        res.setHeader("Content-Type", "application/pdf");
      } else if (
        format === "docx" ||
        format === "rebuttal_letter" ||
        format === "rebuttal-letter"
      ) {
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }

      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.setHeader("Content-Length", result.byteSize);
      res.send(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/projects/:id/export", projectLimit, exportHandler);
  app.post("/api/projects/:id/export/:format", projectLimit, exportHandler);
  app.get("/api/projects/:id/export/:format", projectLimit, exportHandler);
}
