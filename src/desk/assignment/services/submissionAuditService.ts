/**
 * Submission Audit Services
 * - Rubric Compliance Evaluator: Assesses draft against Phase 1 criteria, computes grade band prediction and readiness percentage.
 * - Citation Reconciliation Auditor: Ensures 100% of in-text citations map to a valid entry in the auto-generated reference list.
 */

import { countProseWords } from "../../../shared/proseBlocks";
import type {
AssignmentBriefState,
CitationAuditResult,
CitationAuditIssue,
RubricScoreReport,
RubricScoreCriterion,DiscoveredSource,
UploadedSourceDocument,
AssignmentDraftingSection,
FlowAuditResult,
FlowAuditIssue
} from "../types";

/**
 * Extracts in-text citations from text or markdown.
 * Supports:
 * - Parenthetical author-year: (Smith, 2020), (Taylor & Jones, 2021), (World Bank, 2022)
 * - Bracketed author-year: [Smith, 2020]
 * - Bracketed evidence tokens: [ev-xxx], [source-xxx]
 * - Bracketed numeric citations: [1], [2]
 */
export function extractInTextCitations(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const found: string[] = [];

  // 1. Parenthetical author-year: (Smith, 2020) or (Smith et al., 2020, p. 12)
  const parentheticalRegex = /\(([A-Z][A-Za-z\s&.,'-]+?,\s*(?:19|20)\d{2}[a-z]?(?:,\s*p{1,2}\.?\s*\d+(?:-\d+)?)?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = parentheticalRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    // Exclude false positives like "(e.g., 2020)" or pure dates
    if (!/^(?:e\.g\.|i\.e\.|see|figure|table|eq)\b/i.test(raw)) {
      found.push(raw);
    }
  }

  // 2. Bracketed author-year: [Smith, 2020]
  const bracketAuthorRegex = /\[([A-Z][A-Za-z\s&.,'-]+?,\s*(?:19|20)\d{2}[a-z]?)\]/g;
  while ((match = bracketAuthorRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    found.push(raw);
  }

  // 3. Evidence / Source tokens: [ev-123], [source-456]
  const tokenRegex = /\[((?:ev|source)-[a-zA-Z0-9_-]+)\]/g;
  while ((match = tokenRegex.exec(text)) !== null) {
    found.push(match[1]);
  }

  // 4. Bracketed numeric citations: [1], [2]
  const numericRegex = /\[(\d+)\]/g;
  while ((match = numericRegex.exec(text)) !== null) {
    found.push(match[1]);
  }

  return found;
}

/**
 * Normalizes author name to extract surname / key token
 */
function extractSurname(fullName: string): string {
  const cleaned = fullName.replace(/,\s*(?:Jr|Sr|[I|V|X]+)\.?$/i, "").trim();
  const parts = cleaned.split(/\s+/);
  return (parts[parts.length - 1] || cleaned).toLowerCase();
}

/**
 * Checks whether an extracted citation string matches a given source
 */
function doesCitationMatchSource(
  citationStr: string,
  source: DiscoveredSource,
  sourceIndex: number
): boolean {
  const normCitation = citationStr.toLowerCase();

  // Match token / ID
  if (source.id && (normCitation === source.id.toLowerCase() || normCitation.includes(source.id.toLowerCase()))) {
    return true;
  }

  // Match numeric citation [1] to index 1 (1-based)
  const numericVal = parseInt(citationStr, 10);
  if (!isNaN(numericVal) && numericVal === sourceIndex + 1) {
    return true;
  }

  // Extract year from citation string
  const yearMatch = citationStr.match(/\b((?:19|20)\d{2})\b/);
  const citationYear = yearMatch ? yearMatch[1] : null;

  // Extract author surnames from source
  const sourceAuthors = Array.isArray(source.authors) ? source.authors : [];
  const authorSurnames = sourceAuthors.map((a) => extractSurname(a));

  // Check if year matches
  const sourceYear = source.year ? String(source.year).trim() : null;
  const yearMatches = !citationYear || !sourceYear || citationYear === sourceYear;

  // Check if any author surname is present in the citation text
  const authorMatches = authorSurnames.some((surname) => {
    if (!surname || surname.length < 2) return false;
    const regex = new RegExp(`\\b${surname}\\b`, "i");
    return regex.test(citationStr);
  });

  if (authorMatches && yearMatches) {
    return true;
  }

  // Fallback: check if the citation text matches source title or venue keyword
  if (source.title && normCitation.length > 5 && source.title.toLowerCase().includes(normCitation)) {
    return true;
  }

  // Check if source's own formatted citation string contains the citation anchor
  if (source.citation && source.citation.toLowerCase().includes(normCitation)) {
    return true;
  }

  return false;
}

/**
 * Citation Reconciliation Auditor
 * Scans markdown or drafting sections for in-text citations and reconciles them
 * against approved / active sources and user uploads.
 */
export function auditCitations(
  draftContent: string | AssignmentDraftingSection[],
  sources: DiscoveredSource[] = [],
  userUploadedSources: UploadedSourceDocument[] = [],
  approvedSourceIds?: string[]
): CitationAuditResult {
  const rawText = Array.isArray(draftContent)
    ? draftContent.map((s) => `${s.title}\n${s.draftContent || ""}`).join("\n\n")
    : typeof draftContent === "string"
    ? draftContent
    : "";

  const inTextCitations = extractInTextCitations(rawText);

  // Filter sources to approved/active pool
  let referencePool: DiscoveredSource[] = sources;
  if (approvedSourceIds && approvedSourceIds.length > 0) {
    const approvedSet = new Set(approvedSourceIds);
    const approved = sources.filter((s) => approvedSet.has(s.id));
    if (approved.length > 0) {
      referencePool = approved;
    }
  } else {
    // If no approvedSourceIds provided, consider 'kept' or non-'removed'
    const kept = sources.filter((s) => s.status !== "removed");
    if (kept.length > 0) {
      referencePool = kept;
    }
  }

  // Also include uploaded documents as sources
  const uploadedAsSources: DiscoveredSource[] = userUploadedSources.map((u) => ({
    id: u.id,
    title: u.name,
    authors: [u.name.replace(/\.[^/.]+$/, "")],
    year: new Date(u.uploadedAt || Date.now()).getFullYear().toString(),
    type: "institutional",
    relevanceScore: 1,
    mainFinding: u.extractedText ? u.extractedText.slice(0, 100) : "Uploaded reference",
    suggestedUse: "Direct primary reference",
    citation: `${u.name} (Uploaded Document)`,
    status: "kept",
  }));

  const fullPool = [...referencePool, ...uploadedAsSources];

  const unresolvedCitations: string[] = [];
  const reconciledCitations: string[] = [];
  const flaggedIssues: CitationAuditIssue[] = [];

  for (const citation of inTextCitations) {
    let matched = false;
    for (let i = 0; i < fullPool.length; i++) {
      if (doesCitationMatchSource(citation, fullPool[i], i)) {
        matched = true;
        break;
      }
    }

    if (matched) {
      if (!reconciledCitations.includes(citation)) {
        reconciledCitations.push(citation);
      }
    } else {
      if (!unresolvedCitations.includes(citation)) {
        unresolvedCitations.push(citation);
        flaggedIssues.push({
          citation,
          issue: `In-text citation "${citation}" does not correspond to any active source in the bibliography pool.`,
          severity: "error",
          suggestedFix: "Approve a matching scholarly source or remove this ungrounded citation token.",
        });
      }
    }
  }

  const totalInTextCitations = inTextCitations.length;
  const totalBibliographyEntries = fullPool.length;
  const isReconciled = unresolvedCitations.length === 0;

  return {
    totalInTextCitations,
    totalBibliographyEntries,
    isReconciled,
    unresolvedCitations,
    reconciledCitations,
    verifiedCount: reconciledCitations.length,
    flaggedIssues,
  };
}

/**
 * Rubric Compliance Evaluator
 * Assesses full draft against Phase 1 criteria, computes grade band prediction and readiness percentage.
 */
export function evaluateRubricCompliance(
  fullDraftText: string,
  brief: AssignmentBriefState,
  citationAudit?: CitationAuditResult,
  citationCoverage?: {
    totalAnchors: number;
    sourcesWithCitations: number;
    orphanedSources: number;
    sectionCoverage: { sectionId: string; sectionTitle: string; anchorCount: number }[];
    mostCitedSources: { sourceId: string; sourceTitle: string; count: number }[];
  },
  sections?: Array<{ title: string; draftContent?: string }>
): RubricScoreReport {
  const text = (fullDraftText || "").trim();
  const wordCount = countProseWords(text);
  const targetWords = brief.targetWordCount || 2000;
  const prompt = (brief.rawPrompt || brief.instructions || "").trim();

  const missingRequirements: string[] = [];
  const criteriaFeedback: Record<string, string> = {};
  const criteriaList: RubricScoreCriterion[] = [];

  // 1. Check basic length requirements
  const wordRatio = targetWords > 0 ? wordCount / targetWords : 0;
  if (wordCount < 100) {
    missingRequirements.push("Draft is currently incomplete; substantial content must be generated.");
  } else if (wordRatio < 0.6) {
    missingRequirements.push(`Draft length (${wordCount} words) is significantly below target budget of ${targetWords} words.`);
  }

  // 1b. Every section of the outline has text
  const emptySections = (sections ?? []).filter((sec) => countProseWords(sec.draftContent || "") === 0).map((sec) => sec.title || "Untitled section");
  if (emptySections.length > 0) {
    missingRequirements.push(
      `${emptySections.length} section(s) have no text yet: ${emptySections.slice(0, 5).join("; ")}${emptySections.length > 5 ? "; …" : ""}.`
    );
  }

  // 2. Check citation reconciliation status
  if (citationAudit && !citationAudit.isReconciled && citationAudit.unresolvedCitations.length > 0) {
    missingRequirements.push(
      `${citationAudit.unresolvedCitations.length} in-text citation(s) are missing from the verified bibliography reference list.`
    );
  }

  // 2b. Check orphaned sources from citation coverage
  if (citationCoverage && citationCoverage.orphanedSources > 0) {
    missingRequirements.push(
      `${citationCoverage.orphanedSources} approved source(s) are orphaned (not cited in the draft).`
    );
  }

  // 3. Check structural components
  const hasIntro = /introduction|background|context/i.test(text);
  const hasConclusion = /conclusion|summary|implications|recommendation/i.test(text);

  if (!hasIntro && wordCount > 200) {
    missingRequirements.push("Clear introductory overview and contextual statement should be established.");
  }
  if (!hasConclusion && wordCount > 200) {
    missingRequirements.push("Conclusive synthesis and evaluation of broader implications should be provided.");
  }

  // 4. Check prompt-specific command verbs and constraints
  if (prompt) {
    const isCompare = /\b(?:compare|contrast|differences|similarities)\b/i.test(prompt);
    const isCritique = /\b(?:critique|evaluate|assess|critical|analyze|analyse)\b/i.test(prompt);
    const isRecommend = /\b(?:recommend|propose|strategy|solution)\b/i.test(prompt);

    if (isCompare && !/\b(?:whereas|conversely|in contrast|similarly|differs|while)\b/i.test(text)) {
      missingRequirements.push("Prompt specifies comparison; ensure explicit comparative contrasts between viewpoints.");
    }
    if (isCritique && !/\b(?:however|nevertheless|limitations|counterargument|shortcomings|critique)\b/i.test(text)) {
      missingRequirements.push("Prompt requires critical analysis; address methodological limitations and counter-arguments.");
    }
    if (isRecommend && !/\b(?:recommend|propose|implication|strategic|future)\b/i.test(text)) {
      missingRequirements.push("Prompt requests recommendations; incorporate actionable strategic conclusions.");
    }
  }

  // Check explicit constraints from briefLedger or constraints list
  if (Array.isArray(brief.constraints)) {
    for (const c of brief.constraints) {
      if (c && c.length > 10) {
        const keyTerms = c.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        const matchFound = keyTerms.some((t) => text.toLowerCase().includes(t));
        if (!matchFound) {
          missingRequirements.push(`Address explicit constraint: "${c}"`);
        }
      }
    }
  }

  // 5. Evaluate individual criteria
  // Only the brief's own marking criteria are listed; none are invented when the brief has none.
  const definedCriteria = (brief.rubricCriteria ?? []).map((c, idx) => ({
    id: c.id || `crit-${idx}`,
    name: c.criterion || c.title || `Criterion ${idx + 1}`,
    weight: c.weightPercentage || c.weightPercent || undefined,
    description: c.description || c.expectedStandard || "",
  }));

  // Readiness is the share of checks that can be shown to pass. Scholar does
  // not predict marks: no grade, band or per-criterion score is invented.
  const reconciled = !citationAudit || citationAudit.isReconciled || citationAudit.unresolvedCitations.length === 0;
  const checks: Array<{ name: string; passed: boolean }> = [
    { name: `Length within ±10% of ${targetWords} words`, passed: wordRatio >= 0.9 && wordRatio <= 1.1 },
    { name: "Introduction present", passed: hasIntro },
    { name: "Conclusion present", passed: hasConclusion },
    { name: "Every section has text", passed: emptySections.length === 0 },
    { name: "Every in-text citation is in the reference list", passed: reconciled },
    { name: "Every approved source is cited", passed: !citationCoverage || citationCoverage.orphanedSources === 0 },
    {
      name: "What the question asks for is addressed",
      passed: !missingRequirements.some((m) => /^Prompt |^Address explicit constraint/.test(m)),
    },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const readiness = Math.round((passed / checks.length) * 100);

  for (const crit of definedCriteria) {
    criteriaFeedback[crit.name] = crit.description || "";
    criteriaList.push({
      criterion: crit.name,
      score: 0,
      maxScore: 0,
      feedback: crit.description || "",
      weightPercentage: crit.weight,
    });
  }

  const ready = missingRequirements.length === 0;
  return {
    predictedGrade: "Not graded",
    readinessPercentage: readiness,
    criteriaFeedback,
    missingRequirements,
    overallScore: readiness,
    bandLabel: `${passed} of ${checks.length} checks passed`,
    summary: ready
      ? `All ${checks.length} checks pass. Scholar doesn't predict marks; your marker decides the grade.`
      : `${missingRequirements.length} item(s) to address before you submit (${passed} of ${checks.length} checks pass). Scholar doesn't predict marks.`,
    criteria: criteriaList,
    strengths: checks.filter((c) => c.passed).map((c) => c.name),
    priorityFixes: missingRequirements,
  };
}

/**
 * Flow & Transitions Auditor
 * Analyzes the transitions between paragraphs and flags sudden jumps in logic.
 */
export function auditFlowAndTransitions(draftContent: string | AssignmentDraftingSection[]): FlowAuditResult {
  const rawText = Array.isArray(draftContent)
    ? draftContent.map((s) => s.draftContent || "").join("\n\n")
    : typeof draftContent === "string"
    ? draftContent
    : "";

  const paragraphs = rawText.split("\n\n").map(p => p.trim()).filter(p => p.length > 50 && !p.startsWith("#"));
  const issues: FlowAuditIssue[] = [];

  const STOP = new Set("which their there these those about would could should between within without because however through therefore".split(" "));
  const contentWords = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 5 && !STOP.has(w))
        .map((w) => w.replace(/(?:ies|es|s)$/, ""))
    );

  const transitionWords = [
    "however", "furthermore", "moreover", "conversely", "in contrast", 
    "similarly", "consequently", "therefore", "thus", "nevertheless",
    "addition", "although", "despite", "while"
  ];

  let flowScore = 100;

  for (let i = 1; i < paragraphs.length; i++) {
    const prev = paragraphs[i - 1];
    const curr = paragraphs[i];
    
    const currLower = curr.toLowerCase();
    const hasTransition = transitionWords.some(w => currLower.startsWith(w) || currLower.substring(0, 30).includes(w));
    
    // A paragraph with no linking word that also shares no content words with the
    // one before it has no visible connection to it: flag that, and only that.
    const sharesTopic = [...contentWords(curr)].some((w) => contentWords(prev).has(w));
    if (!hasTransition && !sharesTopic) {
      issues.push({
        paragraphIndex: i,
        textSnippet: curr.substring(0, 80) + "...",
        issue: "No link to the previous paragraph: no connecting word and no shared key terms.",
        severity: "warning",
        suggestedTransition: "Open with a sentence that names how this point follows from the previous one.",
      });
      flowScore -= 10;
    }
  }

  return {
    totalParagraphs: paragraphs.length,
    issues,
    score: Math.max(0, flowScore)
  };
}
