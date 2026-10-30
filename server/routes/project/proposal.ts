import { Router, Request, Response } from "express";
import { asyncRoute, loadOwnedProject, getSharedStore } from "../project.ts";
import {
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../src/utils/scholarlyVoiceGuard.ts";
import { scholarBrain, type CitationStyleKey } from "../../src/services/scholarBrain.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../src/ai/aiRouteErrors.ts";
import type { VerifiedSourceItem } from "../../src/utils/citationLockScrubber.ts";
import { countExactWords } from "../../src/utils/wordBudgetAllocator.ts";

const router = Router({ mergeParams: true });

export interface ProposalCriterionResult {
  criterion: "Significance" | "Investigator(s)" | "Innovation" | "Approach" | "Environment";
  score: number; // 1.0 (exceptional) - 9.0 (poor)
  verdict: string;
  critique: string;
  recommendation: string;
}

export interface StudySectionMemberVerdict {
  role: string;
  verdict: string;
}

export interface StudySectionSimulationResult {
  success: boolean;
  title: string;
  agency: string;
  overallImpactScore: string;
  recommendationForFunding: string;
  studySectionMembers: StudySectionMemberVerdict[];
  criteria: ProposalCriterionResult[];
}

export interface AimsAuditCheck {
  name: string;
  status: "passed" | "warn" | "fail";
  detail: string;
}

export interface AimsAuditResponse {
  success: boolean;
  checks: AimsAuditCheck[];
}




/**
 * POST /api/projects/:projectId/proposal/study-section-simulate
 * Evaluates proposal text and aims against NIH/NSF criteria using AI. With no usable AI answer it says so; it never scores the proposal itself.
 */
router.post(
  "/study-section-simulate",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const body = req.body || {};
    const title = String(body.title || record.answers?.title || "").trim();
    const specificAims: string[] = (
      Array.isArray(body.specificAims) && body.specificAims.length > 0
        ? body.specificAims
        : Array.isArray(record.answers?.specificAims)
        ? record.answers.specificAims
        : []
    ).filter((a: unknown): a is string => typeof a === "string" && a.trim().length > 0);
    const significance = String(body.significance || record.answers?.significanceStatement || "").trim();
    const strategy = String(body.strategy || record.answers?.strategy || "").trim();
    const agency = String(body.agency || record.answers?.fundingAgency || record.answers?.agency || "").trim();
    const mechanism = String(body.mechanism || record.answers?.mechanism || "").trim();

    // The review is of the user's own proposal; never of placeholder aims.
    if (!title || specificAims.length === 0) {
      return res.status(400).json({ error: "Add your proposal title and at least one specific aim first." });
    }

    {
      try {
        const systemPrompt = `You are an NIH/NSF Study Section Scientific Review Officer and Primary Reviewer.
Evaluate the grant proposal and return a strictly formatted JSON object matching this schema:
{
  "overallImpactScore": "string (e.g. 1.8 (Top 12th Percentile - Highly Competitive))",
  "recommendationForFunding": "string (e.g. Approved for Award Consideration)",
  "studySectionMembers": [
    { "role": "string", "verdict": "string" }
  ],
  "criteria": [
    {
      "criterion": "Significance" | "Investigator(s)" | "Innovation" | "Approach" | "Environment",
      "score": number (1.0 to 9.0 scale, where 1.0 is exceptional),
      "verdict": "string",
      "critique": "string",
      "recommendation": "string"
    }
  ]
}
Return ONLY valid JSON. Zero markdown backticks, zero conversational preambles.`;

        const userPrompt = `Evaluate this grant proposal:
Agency: ${agency || "not specified"}${mechanism ? ` (${mechanism})` : ""}
Title: ${title}
Specific Aims:
${specificAims.map((aim, idx) => `${idx + 1}. ${aim}`).join("\n")}

Significance Statement:
${significance || "(not provided)"}

Research Strategy / Methodological Deficit:
${strategy || "(not provided)"}`;

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
          overallImpactScore?: string;
          recommendationForFunding?: string;
          studySectionMembers?: StudySectionMemberVerdict[];
          criteria?: ProposalCriterionResult[];
        } | null;

        // A criterion without a real 1-9 score is dropped, never given a default one.
        const criteria = Array.isArray(parsed?.criteria)
          ? parsed.criteria.filter(
              (c) => typeof c.score === "number" && c.score >= 1 && c.score <= 9 && typeof c.criterion === "string"
            )
          : [];
        if (!parsed?.overallImpactScore || criteria.length === 0) {
          throw new UnusableAiResponseError("study section review");
        }
        return res.json({
          success: true,
          title,
          agency,
          mechanism,
          overallImpactScore: normalizeUnicodeNFC(sanitizeScholarlyText(parsed.overallImpactScore)),
          recommendationForFunding: normalizeUnicodeNFC(sanitizeScholarlyText(parsed.recommendationForFunding || "")),
          studySectionMembers: Array.isArray(parsed.studySectionMembers) ? parsed.studySectionMembers : [],
          criteria: criteria.map((c) => ({
            criterion: c.criterion,
            score: c.score,
            verdict: normalizeUnicodeNFC(sanitizeScholarlyText(c.verdict || "")),
            critique: normalizeUnicodeNFC(sanitizeScholarlyText(c.critique || "")),
            recommendation: normalizeUnicodeNFC(sanitizeScholarlyText(c.recommendation || "")),
          })),
        });
      } catch (err) {
        return sendAiFailure(res, err, "Study section review");
      }
    }
  })
);

/**
 * POST /api/projects/:projectId/proposal/aims-audit
 * Audits Specific Aims text for hypothesis clarity, measurable metrics, and structural balance.
 */
router.post(
  "/aims-audit",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const aimsText: string = String(req.body?.aimsText || (
      Array.isArray(record.answers?.specificAims)
        ? record.answers.specificAims.join("\n")
        : ""
    )).trim();

    if (aimsText.length < 30) {
      return res.status(400).json({ error: "Write your hypothesis and specific aims (at least a sentence) before auditing them." });
    }

    {
      try {
        const systemPrompt = `You are an expert NIH/NSF grant consultant. Audit the submitted Specific Aims text and output a JSON array of check items:
{
  "checks": [
    {
      "name": "string (e.g. Overarching Hypothesis Stated)",
      "status": "passed" | "warn" | "fail",
      "detail": "string (scholarly justification)"
    }
  ]
}
Evaluate specifically:
1. Overarching Hypothesis Stated
2. Aim Structural Independence
3. Quantifiable Deliverables & Benchmarks
4. Specific Aims Page Length Budget
Output ONLY valid JSON.`;

        const brainRes = await scholarBrain.complete({
          req,
          browserFallback: true,
          taskClass: "verification",
          systemPrompt,
          userPrompt: `Audit these Specific Aims:\n\n${aimsText}`,
          responseFormat: "json",
        });

        const raw = brainRes.parsedJson || (brainRes.text ? JSON.parse(brainRes.text.replace(/```json/g, "").replace(/```/g, "").trim()) : null);
        const parsed = raw as { checks?: Array<{ name?: unknown; status?: unknown; detail?: unknown }> } | null;

        const checks = Array.isArray(parsed?.checks)
          ? parsed.checks.filter((chk) => typeof chk.name === "string" && chk.name.trim().length > 0)
          : [];
        if (checks.length === 0) throw new UnusableAiResponseError("aims audit");
        return res.json({
          success: true,
          checks: checks.map((chk) => ({
            name: sanitizeScholarlyText(chk.name as string),
            // An unrecognised status is never shown as a pass.
            status: (typeof chk.status === "string" && ["passed", "warn", "fail"].includes(chk.status))
              ? (chk.status as "passed" | "warn" | "fail")
              : "warn",
            detail: sanitizeScholarlyText(typeof chk.detail === "string" ? chk.detail : ""),
          })),
        });
      } catch (err) {
        return sendAiFailure(res, err, "Specific aims audit");
      }
    }
  })
);

/**
 * POST /api/projects/:projectId/proposal/draft-section
 * Drafts an NIH/NSF proposal section grounded in retrieved scholarly evidence and vault sources.
 */
router.post(
  "/draft-section",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const sectionTitle: string = String(req.body?.sectionTitle || "").trim();
    const targetWords: number = typeof req.body?.targetWords === "number" ? req.body.targetWords : 500;
    const citationStyle: CitationStyleKey = (req.body?.citationStyle as CitationStyleKey) || "apa7";
    const dialect = req.body?.dialect === "en-US" ? "en-US" : "en-GB";

    const answers = (record.answers || {}) as Record<string, unknown>;
    const title = String(answers.title || answers.working_title || "").trim();
    const agency = String(answers.agency || answers.fundingAgency || "");
    const mechanism = String(answers.mechanism || "");
    if (!title || !sectionTitle) {
      return res.status(400).json({ error: "Add your proposal title and the section title before drafting." });
    }
    const userPromptText = req.body?.prompt
      ? String(req.body.prompt)
      : `Draft the ${sectionTitle} section for this grant application.`;

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
    const searchQuery = `${title} ${sectionTitle}`.trim();
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

    const systemPrompt = `You are an elite academic grant writer specializing in ${agency} (${mechanism}) applications.
Draft the "${sectionTitle}" section adhering strictly to high-rigour scholarly conventions.
Target word count: approximately ${targetWords} words.
Scholarly dialect: ${dialect}.

CITATION RULES:
1. Ground empirical assertions and prior literature using ONLY the provided evidence tokens:
${evidenceLedger || "No external sources available."}
2. Insert citations using strictly the token format [CITE:id] (e.g. [CITE:src_1] or [CITE:src_vault_1]).
3. NEVER invent or hallucinate uncited author names or publication years.
4. Maintain an objective, assertive, and grant-competitive scholarly tone.`;

    try {
      const brainRes = await scholarBrain.complete({
        req,
        browserFallback: true,
        taskClass: "drafting",
        systemPrompt,
        userPrompt: `${userPromptText}\n\nProject Title: ${title}\nAgency: ${agency || "not specified"}${mechanism ? ` (${mechanism})` : ""}\nSection: ${sectionTitle}`,
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
        sectionTitle,
        agency,
        mechanism,
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
      return sendAiFailure(res, err, "Proposal section draft");
    }
  })
);

export default router;
