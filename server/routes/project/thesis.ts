import { Router, Request, Response } from "express";
import { asyncRoute, loadOwnedProject, getSharedStore } from "../project.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../src/utils/scholarlyVoiceGuard.ts";
import { scholarBrain, type CitationStyleKey } from "../../src/services/scholarBrain.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../src/ai/aiRouteErrors.ts";
import type { VerifiedSourceItem } from "../../src/utils/citationLockScrubber.ts";
import { countExactWords } from "../../src/utils/wordBudgetAllocator.ts";
import {
  evaluateAllChaptersGating,
  initialProjectGateState,
  flattenSections,
  type ChapterGateSummary,
} from "../../../src/app/conductor/conductor.ts";
import { catalog } from "../../../src/app/atlas/atlas.ts";
import { emptyDocument } from "../../../src/domain/document/model.ts";
import { appendBlock } from "../../../src/domain/document/ops.ts";
import { emptyGraph } from "../../../src/domain/claim/graph.ts";

const router = Router({ mergeParams: true });

export interface VivaQuestion {
  id: string;
  category: string;
  examinerQuestion: string;
  assessmentFocus: string;
  suggestedRebuttalStructure: string[];
}

export interface VivaSimulationResponse {
  success: boolean;
  title: string;
  examinerPersona: string;
  examinerRigorScore: string;
  questions: VivaQuestion[];
}

export interface ChapterInput {
  chapterNumber: number;
  title: string;
  wordCount: number;
  targetWordCount: number;
  status: "not_started" | "drafting" | "reviewed" | "completed";
}

export interface CrossChapterCheck {
  check: string;
  status: "passed" | "warn" | "fail";
  details: string;
}

export interface ChapterAuditResult {
  totalChapters: number;
  alignmentScore: number;
  coherenceStatus: string;
  crossChapterChecks: CrossChapterCheck[];
  chapterSummaries?: ChapterGateSummary[];
  allChaptersReadyForG6?: boolean;
}




/**
 * POST /api/projects/:projectId/thesis/viva-simulate
 * Generates an adversarial doctoral defense viva panel based on thesis context.
 */
router.post(
  "/viva-simulate",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const body = req.body || {};
    const title = String(body.title || record.answers?.thesisTitle || record.answers?.title || "").trim();
    const degreeLevel = String(body.degreeLevel || record.answers?.degreeLevel || "").trim();
    const theoreticalFramework = String(body.theoreticalFramework || record.answers?.theoreticalFramework || "").trim();
    const researchQuestions: string[] = (
      Array.isArray(body.researchQuestions) && body.researchQuestions.length > 0
        ? body.researchQuestions
        : Array.isArray(record.answers?.researchQuestions)
        ? record.answers.researchQuestions
        : []
    ).filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0);
    const methodology = String(body.methodology || record.answers?.methodologicalDesign || "").trim();

    // The examiner questions are built from the candidate's own thesis; never from placeholders.
    if (!title || researchQuestions.length === 0) {
      return res.status(400).json({ error: "Add your thesis title and at least one research question first." });
    }

    try {
      // 1. Retrieve supporting empirical/theoretical evidence to ground viva panel
      const evidence = await scholarBrain.retrieveEvidence({
        query: `${title} ${theoreticalFramework} ${methodology}`.trim(),
        maxResults: 6,
      });

      const evidenceBrief = evidence.length > 0
        ? `\nRelevant Benchmarks:\n` + evidence.slice(0, 4).map((e) => `- ${e.title} (${e.authors.slice(0, 2).join(", ")}, ${e.year || "n.d."})`).join("\n")
        : "";

      const systemPrompt = `${buildScholarlyVoiceSystemPrompt({ discipline: "Doctoral Viva Voce Defense" })}
You are a senior external examiner presiding over a doctoral Viva Voce oral defense.
Formulate rigorous, adversarial examiner questions based on the candidate's thesis and output a valid JSON object matching this schema:
{
  "examinerPersona": "string: the examiner's role and specialism only, never a personal name (e.g. Senior External Examiner, Quantitative Methodologies)",
  "examinerRigorScore": "string (e.g. High (Viva Voce Standard))",
  "questions": [
    {
      "id": "string",
      "category": "string (e.g. Theoretical Framing, Methodological Rigor, Original Contribution, Limitations)",
      "examinerQuestion": "string",
      "assessmentFocus": "string",
      "suggestedRebuttalStructure": ["string", "string", "string"]
    }
  ]
}
Output ONLY valid JSON. Zero markdown codeblocks, zero conversational filler.`;

      const userPrompt = `Candidate Dissertation Context:
Title: ${title}
Degree Level: ${degreeLevel || "not specified"}
Theoretical Framework: ${theoreticalFramework || "not specified"}
Methodology: ${methodology || "not specified"}
Research Questions:
${researchQuestions.map((q, idx) => `${idx + 1}. ${q}`).join("\n")}${evidenceBrief}`;

      const brainRes = await scholarBrain.complete({
        req,
        browserFallback: true,
        taskClass: "verification",
        systemPrompt,
        userPrompt,
        responseFormat: "json",
      });

      const raw = brainRes.parsedJson || (brainRes.text ? JSON.parse(brainRes.text.replace(/```json/g, "").replace(/```/g, "").trim()) : null);
      const parsed = raw as {
        examinerPersona?: unknown;
        examinerRigorScore?: unknown;
        questions?: Array<{
          id?: unknown;
          category?: unknown;
          examinerQuestion?: unknown;
          assessmentFocus?: unknown;
          suggestedRebuttalStructure?: unknown;
        }>;
      } | null;

      const usableQuestions = Array.isArray(parsed?.questions)
        ? parsed.questions.filter((q) => typeof q.examinerQuestion === "string" && q.examinerQuestion.trim().length > 0)
        : [];
      if (usableQuestions.length === 0) throw new UnusableAiResponseError("examiner questions");
      return res.json({
          success: true,
          title,
          examinerPersona: normalizeUnicodeNFC(sanitizeScholarlyText(typeof parsed?.examinerPersona === "string" ? parsed.examinerPersona : "External examiner")),
          examinerRigorScore: normalizeUnicodeNFC(sanitizeScholarlyText(typeof parsed?.examinerRigorScore === "string" ? parsed.examinerRigorScore : "")),
          questions: usableQuestions.map((q, idx) => ({
            id: typeof q.id === "string" ? q.id : `q-${idx + 1}`,
            category: normalizeUnicodeNFC(sanitizeScholarlyText(typeof q.category === "string" ? q.category : "Defense Examination")),
            examinerQuestion: normalizeUnicodeNFC(sanitizeScholarlyText(typeof q.examinerQuestion === "string" ? q.examinerQuestion : "")),
            assessmentFocus: normalizeUnicodeNFC(sanitizeScholarlyText(typeof q.assessmentFocus === "string" ? q.assessmentFocus : "")),
            suggestedRebuttalStructure: Array.isArray(q.suggestedRebuttalStructure)
              ? q.suggestedRebuttalStructure
                  .filter((s): s is string => typeof s === "string")
                  .map((s) => normalizeUnicodeNFC(sanitizeScholarlyText(s)))
              : [],
          })),
        });
    } catch (err) {
      return sendAiFailure(res, err, "Viva examiner questions");
    }
  })
);

function computeChapterGating(record: any, chapters: ChapterInput[]) {
  const spec = catalog.get(record.outputTypeId) || catalog.getOrThrow("OT-07");
  const project = record.gateState || initialProjectGateState(record.projectId);
  let doc = emptyDocument(record.projectId, spec.label);

  const sections = flattenSections(spec.structure.sections);

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const sec = sections[i];
    const secKey = sec ? sec.key : `chapter_${ch.chapterNumber}`;
    const wordRep = Math.max(1, Math.min(100, Math.floor((ch.wordCount || 100) / 10)));
    const sampleText = Array(wordRep).fill("Academic analysis and empirical synthesis.").join(" ");
    doc = appendBlock(doc, secKey, "paragraph", sampleText);
    const lastBlock = doc.blocks[doc.blocks.length - 1];
    if (lastBlock) {
      lastBlock.id = secKey;
    }
  }

  const claimGraph = emptyGraph();
  return evaluateAllChaptersGating(project, {
    spec,
    document: doc,
    claimGraph,
    answers: (record.answers as any) || {},
  });
}

/**
 * POST /api/projects/:projectId/thesis/chapter-audit
 * Performs cross-chapter consistency and structural alignment audits.
 */
router.post(
  "/chapter-audit",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const chapters: ChapterInput[] = Array.isArray(req.body?.chapters) && req.body.chapters.length > 0
      ? req.body.chapters
      : Array.isArray(record.answers?.chapters)
      ? (record.answers.chapters as ChapterInput[])
      : [];

    // Audit only the user's own chapters; never a placeholder outline.
    if (chapters.length === 0) {
      return res.status(400).json({ error: "Add at least one chapter before running the cross-chapter audit." });
    }

    const gating = computeChapterGating(record, chapters);

    try {
      const systemPrompt = `${buildScholarlyVoiceSystemPrompt({ discipline: "Dissertation Committee Audit" })}
You are an academic dissertation auditor. Analyze the submitted chapter progression and return a JSON object:
{
  "totalChapters": number,
  "alignmentScore": number (0 to 100),
  "coherenceStatus": "string (e.g. Strong Academic Flow)",
  "crossChapterChecks": [
    {
      "check": "string",
      "status": "passed" | "warn" | "fail",
      "details": "string"
    }
  ]
}
Output ONLY valid JSON.`;

      const userPrompt = `Audit these dissertation chapters:
${chapters.map((c) => `Ch ${c.chapterNumber}: "${c.title}" (${c.wordCount}/${c.targetWordCount} words, status: ${c.status})`).join("\n")}`;

      const brainRes = await scholarBrain.complete({
        req,
        browserFallback: true,
        taskClass: "verification",
        systemPrompt,
        userPrompt,
        responseFormat: "json",
      });

      const raw = brainRes.parsedJson || (brainRes.text ? JSON.parse(brainRes.text.replace(/```json/g, "").replace(/```/g, "").trim()) : null);
      const parsed = raw as {
        totalChapters?: unknown;
        alignmentScore?: unknown;
        coherenceStatus?: unknown;
        crossChapterChecks?: Array<{
          check?: unknown;
          status?: unknown;
          details?: unknown;
        }>;
      } | null;

      if (!parsed || typeof parsed.alignmentScore !== "number" || !Array.isArray(parsed.crossChapterChecks)) {
        throw new UnusableAiResponseError("chapter audit");
      }

      const audit: ChapterAuditResult = {
        totalChapters: typeof parsed.totalChapters === "number" ? parsed.totalChapters : chapters.length,
        alignmentScore: Math.max(0, Math.min(100, parsed.alignmentScore)),
        coherenceStatus: normalizeUnicodeNFC(sanitizeScholarlyText(typeof parsed.coherenceStatus === "string" ? parsed.coherenceStatus : "")),
        crossChapterChecks: parsed.crossChapterChecks
          .filter((chk) => typeof chk.check === "string" && chk.check.trim().length > 0)
          .map((chk) => ({
            check: normalizeUnicodeNFC(sanitizeScholarlyText(chk.check as string)),
            // An unrecognised status is never shown as a pass.
            status: (typeof chk.status === "string" && ["passed", "warn", "fail"].includes(chk.status))
              ? (chk.status as "passed" | "warn" | "fail")
              : "warn",
            details: normalizeUnicodeNFC(sanitizeScholarlyText(typeof chk.details === "string" ? chk.details : "")),
          })),
        chapterSummaries: gating.chapterSummaries,
        allChaptersReadyForG6: gating.allChaptersReadyForG6,
      };

      return res.json({
        success: true,
        audit,
        chapterSummaries: gating.chapterSummaries,
        allChaptersReadyForG6: gating.allChaptersReadyForG6,
        alignmentScore: audit.alignmentScore,
        coherenceStatus: audit.coherenceStatus,
      });
    } catch (err) {
      return sendAiFailure(res, err, "Cross-chapter audit");
    }
  })
);

/**
 * GET /api/projects/:projectId/thesis/gate-status
 * Returns per-chapter gating evaluation and exit criteria summaries.
 */
router.get(
  "/gate-status",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    let chapters: ChapterInput[] = [];
    if (typeof req.query.chapters === "string") {
      try {
        chapters = JSON.parse(req.query.chapters);
      } catch {}
    } else if (Array.isArray(record.answers?.chapters)) {
      chapters = record.answers.chapters as ChapterInput[];
    }

    const gating = computeChapterGating(record, chapters);

    return res.json({
      success: true,
      projectId: record.projectId,
      allChaptersReadyForG6: gating.allChaptersReadyForG6,
      chapterSummaries: gating.chapterSummaries,
    });
  })
);

/**
 * POST /api/projects/:projectId/thesis/draft-chapter
 * Drafts a doctoral dissertation chapter grounded in live scholarly evidence and vault sources.
 */
router.post(
  "/draft-chapter",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const chapterNumber: number = typeof req.body?.chapterNumber === "number" ? req.body.chapterNumber : 1;
    const chapterTitle: string = String(req.body?.chapterTitle || "").trim();
    const targetWords: number = typeof req.body?.targetWords === "number" ? req.body.targetWords : 1000;
    const citationStyle: CitationStyleKey = (req.body?.citationStyle as CitationStyleKey) || "apa7";
    const dialect = req.body?.dialect === "en-US" ? "en-US" : "en-GB";

    const answers = (record.answers || {}) as Record<string, unknown>;
    // The Thesis workspace saves its title as thesisTitle; older projects used title / working_title.
    const title = String(answers.thesisTitle || answers.title || answers.working_title || "").trim();
    const degreeLevel = String(answers.degreeLevel || "thesis");
    const theoreticalFramework = String(answers.theoreticalFramework || "not specified");
    const methodology = String(answers.methodologicalDesign || "not specified");
    const researchQuestions = (Array.isArray(answers.researchQuestions) ? answers.researchQuestions : [])
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
    if (!title || !chapterTitle) {
      return res.status(400).json({ error: "Add your thesis title and the chapter title before drafting." });
    }
    const userPromptText = req.body?.prompt
      ? String(req.body.prompt)
      : `Draft Chapter ${chapterNumber}: "${chapterTitle}" for this ${degreeLevel}.`;

    // 1. Gather Vault sources and user datasets from project record
    const rawVault = Array.isArray(record.evidenceLedger?.sources)
      ? record.evidenceLedger.sources
      : Array.isArray(answers.vaultSources)
      ? (answers.vaultSources as Array<{ id?: string; title?: string; authors?: string[]; year?: number | string; doi?: string; url?: string; journal?: string; keyFindings?: string }>)
      : [];

    const vaultSources: VerifiedSourceItem[] = rawVault.map((s) => ({
      id: s.id || "src_vault",
      title: s.title || "Untitled Vault Source",
      authors: s.authors || ["Unknown"],
      year: s.year ?? "n.d.",
      doi: s.doi,
      url: s.url,
      journal: "journal" in s ? (s.journal as string | undefined) : ("venue" in s ? (s.venue as string | undefined) : undefined),
      keyFindings: "keyFindings" in s ? (s.keyFindings as string | undefined) : ("summary" in s ? (s.summary as string | undefined) : undefined),
    }));

    // 2. Multi-portal scholarly discovery via scholarBrain
    const searchQuery = `${title} ${chapterTitle} ${theoreticalFramework}`.trim();
    const evidenceItems = await scholarBrain.retrieveEvidence({
      query: searchQuery,
      maxResults: 15,
      vaultSources,
    });

    const sourcesForScrubber: VerifiedSourceItem[] = evidenceItems.map((e) => ({
      id: e.id,
      title: e.title,
      authors: e.authors,
      year: e.year ?? "n.d.",
      doi: e.doi,
      url: e.url,
      journal: e.venue,
      keyFindings: e.summary,
    }));

    const evidenceLedger = evidenceItems
      .slice(0, 10)
      .map((e) => `${e.citationToken}: ${e.title} (${Array.isArray(e.authors) ? e.authors.slice(0, 2).join(", ") : e.authors}, ${e.year || "n.d."})`)
      .join("\n");

    const systemPrompt = `You are a distinguished academic doctoral supervisor and scholar.
Draft Chapter ${chapterNumber}: "${chapterTitle}" for a ${degreeLevel} entitled "${title}".
Theoretical Framework: ${theoreticalFramework}.
Methodology: ${methodology}.
${researchQuestions.length ? `Research questions (the chapter must serve these):\n${researchQuestions.map((q, i) => `RQ${i + 1}. ${q}`).join("\n")}\n` : ""}Target word count: approximately ${targetWords} words.
Scholarly dialect: ${dialect}.

CITATION RULES:
1. Ground theoretical assertions and empirical literature using ONLY the provided evidence tokens:
${evidenceLedger || "No external sources available."}
2. Insert citations using strictly the token format [CITE:id] (e.g. [CITE:src_1] or [CITE:src_vault_1]).
3. NEVER invent or hallucinate uncited author names or publication years.
4. Maintain doctoral-level analytical rigor, nuanced synthesis, and zero clichés.`;

    try {
      const brainRes = await scholarBrain.complete({
        req,
        browserFallback: true,
        taskClass: "drafting",
        systemPrompt,
        userPrompt: `${userPromptText}\n\nThesis Title: ${title}\nDegree: ${degreeLevel}\nChapter ${chapterNumber}: ${chapterTitle}`,
        dialect,
        stripCliches: true,
      });

      // Scrub citations and format canonical bibliography
      const scrubResult = scholarBrain.scrubAndFormatCitations(
        brainRes.text,
        sourcesForScrubber,
        citationStyle,
        dialect
      );

      const formattedWordCount = countExactWords(scrubResult.formattedText);

      return res.json({
        success: true,
        chapterNumber,
        chapterTitle,
        degreeLevel,
        content: scrubResult.formattedText,
        bibliography: scrubResult.bibliographyMarkdown,
        wordCount: formattedWordCount,
        burstinessMetrics: brainRes.burstinessMetrics,
        citedSourcesCount: scrubResult.citedSources.length,
        strippedCitations: scrubResult.hallucinatedCitationsStripped,
        provider: brainRes.provider,
        model: brainRes.model,
      });
    } catch (err) {
      return sendAiFailure(res, err, "Chapter draft");
    }
  })
);

export default router;
