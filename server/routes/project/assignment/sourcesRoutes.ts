import express from "express";
import { buildSourceSearchQueries } from "../../../../src/utils/briefSourceQueries.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, getCandidates, buildAuthorizedPolicy, resolveRequestAiConfig } from "../../../src/services/scholarBrain.ts";
import { completeWithFailover } from "../../../../src/platform/gateway/gateway.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import {
  auditDocumentLineByLine,
  runBriefScannerGraph,
  COMMAND_VERB_MAP,
  type DocumentRequirement,
} from "../../../services/briefScannerGraph.ts";
import type {
  AssignmentAnalysis,
  CommandVerbDetail,
  CoreResearchQuestion,
  RecommendedSearchStrategy,
  ResearchPlan,
  TutorWorkspacePatch,
  DiscoveredSource,
} from "../../../../src/desk/assignment/types.ts";
import {
  cleanAnswerString,
  extractStandardizedInstructions,
  normalizeProjectAnswers,
  getSectionPromptGuidelines,
  structureToInternalSections,
} from "../../../../src/desk/assignment/types.ts";
import {
  generateDynamicAssignmentStructure,
  generateAiEnhancedOutline,
  sanitizeOutlineHeadings,
  assignmentStructureToOutlineTree,
  outlineTreeToAssignmentStructure,
} from "../../../../src/desk/assignment/services/outlineService.ts";
import { sanitizeBrief } from "../../../../src/features/understand/services/briefSanitizer.ts";
import { classifyScopeBoundaries, stripLineTags } from "../../../../src/features/understand/services/scopeClassifier.ts";
import {
  isClassroomLogisticsLine,
  isTutorialOrShortQABrief,
  extractSubstantiveBriefQuestions,
  stripSlideArtifacts,
} from "../../../../src/utils/briefExtractor.ts";
import { discoverMultiPortalSources, type DiscoveredSourceDraft } from "../../../src/discovery/discovery.ts";
import {
  replaceBracketTokensWithDeterministicCitations,
  compileDeterministicBibliographyMarkdown,
  formatAskScholarInText,
  formatAskScholarBibliographyEntry,
  type WebsiteCitationItem,
} from "../../../../src/desk/scholarCitationEngine.ts";
import {
  upload,
  getProjectSafe,
  persistSourcesToSupabase,
  isCorruptedOutlineHeadings,
  healCorruptedProjectStructure,
  safeParseObject,
  extractProjectInstructions,
  deriveHeuristicTitle,
  deriveSemanticAcademicTitle,
  autoUpdateProjectTitleIfUntitled,
  buildDeterministicResearchPlan,
} from "./helpers.ts";

const router = express.Router({ mergeParams: true });

// 3. POST /api/projects/:id/assignment/research
router.post("/research", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    plan = project.answers["assignment_research_plan"],
    query: reqQuery,
  } = req.body || {};

  const effectiveQuery = (
    reqQuery ||
    question ||
    project.answers["research_topic"] ||
    project.answers["working_title"] ||
    project.answers["title"] ||
    "academic research"
  ).trim();

  try {
    let discoveredDrafts: DiscoveredSourceDraft[] = [];

    // Query multi-portal discovery (OpenAlex, Crossref, DOAJ, DataCite, arXiv)
    // Never send the raw brief to an index: build clean keyword phrases from it.
    const phrases = buildSourceSearchQueries(effectiveQuery, 4);
    const toRun = phrases.length > 0 ? phrases : [effectiveQuery.slice(0, 200)];
    const settled = await Promise.allSettled(toRun.map((q) => discoverMultiPortalSources(q, 15)));
    const seenKeys = new Set<string>();
    for (const r of settled) {
      if (r.status !== "fulfilled") {
        console.warn("Multi-portal discovery phrase failed:", r.reason);
        continue;
      }
      for (const d of r.value) {
        const key = (d.doi || d.title).toLowerCase();
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        discoveredDrafts.push(d);
      }
    }
    discoveredDrafts = discoveredDrafts.slice(0, 25);

    let sources: DiscoveredSource[] = [];

    if (discoveredDrafts && discoveredDrafts.length > 0) {
      sources = discoveredDrafts.map((draft, idx) => {
        const yearStr = draft.year ? String(draft.year) : "n.d.";
        const srcId = `src-${Date.now()}-${idx + 1}`;
        const authorStr =
          draft.authors.length > 0
            ? draft.authors.length > 2
              ? `${draft.authors[0]} et al.`
              : draft.authors.join(" & ")
            : "Unknown Author";
        const citationStr = `${authorStr} (${yearStr}). ${draft.title}.${draft.venue ? ` ${draft.venue}.` : ""}${
          draft.doi ? ` https://doi.org/${draft.doi}` : ""
        }`;

        return {
          id: srcId,
          title: draft.title,
          authors: draft.authors,
          year: yearStr,
          type: draft.sourceType === "scholarly" ? "journal" : "article",
          journal: draft.venue,
          doi: draft.doi,
          url: draft.url,
          // Only what the index returned; no summary of findings is invented.
          mainFinding: draft.venue ? `Published in ${draft.venue}.` : "",
          suggestedUse:
            draft.authorityTier === "A"
              ? "Primary theoretical framework & empirical evidence grounding"
              : "Supporting literature and contextual evidence",
          citation: citationStr,
          status: "unreviewed",
          retrievalSource: draft.discoveredVia,
          retrievedAt: new Date().toISOString(),
          peerReviewed: draft.authorityTier === "A",
          sourceCredibility:
            draft.authorityTier === "A"
              ? "Gold Standard (Leading Journal / Monograph)"
              : "Standard Academic / University Press",
        } as DiscoveredSource;
      });
    }
    // When live discovery finds nothing the list stays empty: no catalog or
    // synthesized entries are ever offered or saved as discovered sources.

    // Persist discovered sources to Supabase project_sources
    await persistSourcesToSupabase(project.projectId, sources);

    // Save discovered sources to project answers
    project.answers["discovered_sources"] = JSON.stringify(sources);
    await getProjectStore().save(project);

    res.json({ sources });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Assignment research error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg || "Failed to discover research sources" });
    }
  }
});


// 12. POST /api/projects/:id/assignment/citations-ground
router.post("/citations-ground", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    citationStyle = project.answers["citation_style"] || "apa7",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    themes = [],
  } = req.body || {};

  try {
    const effectiveQuery = (
      question ||
      project.answers["research_topic"] ||
      project.answers["title"] ||
      "academic research"
    ).trim();

    let drafts: DiscoveredSourceDraft[] = [];
    try {
      drafts = await discoverMultiPortalSources(effectiveQuery, 15);
    } catch (discErr) {
      console.warn("Multi-portal discovery failed in citations-ground, attempting fallback:", discErr);
      drafts = [];
    }

    if (drafts.length > 0) {
      const citations = drafts.map((d, idx) => {
        const item: WebsiteCitationItem = {
          id: `cit-${idx + 1}`,
          title: d.title,
          authors: d.authors,
          year: d.year ? String(d.year) : "2024",
          journal: d.venue,
          venue: d.venue,
          doi: d.doi,
          url: d.url,
        };
        const inText = formatAskScholarInText(item, idx, citationStyle);
        const bib = formatAskScholarBibliographyEntry(item, idx, citationStyle);

        return {
          id: `cit-${idx + 1}`,
          sourceTitle: d.title,
          authors: d.authors,
          year: d.year ? String(d.year) : "2024",
          journalOrPublisher: d.venue || "Academic Press",
          doi: d.doi || "",
          citationText: bib?.formattedText || `${d.authors.join(", ")} (${d.year || ""}). ${d.title}.`,
          inTextCitation: inText,
          citationStyle,
          verifiedPeerReviewed: d.authorityTier === "A",
          linkedThemeIds: [],
          quoteOrFindingSnippet: d.venue
            ? `Published in ${d.venue}. Grounded scholarly literature addressing key dimensions of inquiry.`
            : "Peer-reviewed literature supporting conceptual foundations.",
        };
      });

      // Persist discovered citations as project sources
      const sourcesToPersist: DiscoveredSource[] = drafts.map((d, idx) => ({
        id: `src-ground-${Date.now()}-${idx + 1}`,
        title: d.title,
        authors: d.authors,
        year: d.year ? String(d.year) : "2024",
        type: d.sourceType === "scholarly" ? "journal" : "article",
        journal: d.venue,
        doi: d.doi,
        url: d.url,
        relevanceScore: 90,
        mainFinding: "Peer-reviewed grounding literature.",
        suggestedUse: "Core conceptual grounding",
        citation: citations[idx].citationText,
        status: "unreviewed",
        retrievalSource: d.discoveredVia,
        retrievedAt: new Date().toISOString(),
        peerReviewed: d.authorityTier === "A",
      }));
      await persistSourcesToSupabase(project.projectId, sourcesToPersist);

      return res.json({ citations });
    }

    // No LLM-written citations: an LLM asked to "identify realistic sources"
    // produces references that may not exist. Report that none were found.
    res.json({ citations: [] });
  } catch (err: unknown) {
    if ((err as Error)?.message === "RequireFrontendLLMException") return;
    console.error("Citation grounding error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: (err as Error).message || "Failed to ground citations" });
    }
  }
});


export default router;
