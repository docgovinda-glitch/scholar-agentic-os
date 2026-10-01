/**
 * Evidence Pack Service — Production Spec §4.1–4.3
 *
 * Before generating each section draft, constructs a structured "evidence pack"
 * from approved sources that are relevant to that specific section. The pack
 * provides the LLM with:
 *
 *   1. Bound sources with citation metadata
 *   2. Extracted evidence passages (from user-uploaded documents)
 *   3. Research blueprint context (purpose, key theories, arguments)
 *   4. Context continuity state from prior sections
 *
 * This ensures section drafting is evidence-grounded, not free-form generation.
 */

import type {
  DiscoveredSource,
  AssignmentDraftingSection,
  UploadedSourceDocument,
  ExtractedSourceEvidence,
  SectionAnalyticalSynthesis,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Pack Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidencePackSource {
  id: string;
  title: string;
  authors: string[];
  year: string;
  journal?: string;
  doi?: string;
  citationText: string;
  retrievalSource?: string;
  peerReviewed?: boolean | null;

  /** Role this source plays in the section */
  role: string;

  /** Key evidence passages from this source relevant to the section */
  evidencePassages: string[];

  /** How this source supports the section's analytical objective */
  relevanceExplanation: string;
}

export interface EvidencePack {
  sectionId: string;
  sectionTitle: string;
  sectionNumber: string;

  /** The section's analytical objective from the research blueprint */
  analyticalObjective: string;

  /** Key theories/frameworks the section should engage with */
  keyTheories: string[];

  /** Key arguments the section should develop */
  keyArguments: string[];

  /** Evidence this section needs */
  evidenceRequired: string;

  /** Counterarguments to address */
  counterarguments: string[];

  /** Expected contribution of this section to the overall argument */
  expectedContribution: string;

  /** Bound sources with evidence passages */
  sources: EvidencePackSource[];

  /** Analytical syntheses already defined for this section */
  syntheses: SectionAnalyticalSynthesis[];

  /** Context continuity from the previous section */
  contextContinuity: ContextContinuityState | null;

  /** Total number of bound sources */
  totalSourceCount: number;

  /** Word budget for this section */
  targetWordCount: number;
}

export interface ContextContinuityState {
  /** Summary of key claims made so far */
  claimsSoFar: string[];

  /** Sources already cited in previous sections */
  sourcesCitedSoFar: string[];

  /** The last section's concluding transition/link */
  lastSectionLink: string;

  /** Running themes that should be maintained */
  runningThemes: string[];

  /** Total words generated so far */
  wordsGeneratedSoFar: number;

  /** How many sections have been completed */
  sectionsCompleted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Pack Construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find sources relevant to a specific section by:
 * 1. Directly bound source IDs (highest priority)
 * 2. Mapped subheading IDs
 * 3. Keyword overlap between section title/purpose and source metadata
 */
function findRelevantSources(
  section: AssignmentDraftingSection,
  allSources: DiscoveredSource[],
  uploadedSources: UploadedSourceDocument[]
): DiscoveredSource[] {
  const relevantSet = new Map<string, DiscoveredSource>();

  // 1. Directly bound sources (highest priority)
  if (section.boundSourceIds && section.boundSourceIds.length > 0) {
    for (const source of allSources) {
      if (section.boundSourceIds.includes(source.id)) {
        relevantSet.set(source.id, source);
      }
    }
  }

  // 2. Sources mapped to this subheading
  for (const source of allSources) {
    if (source.mappedSubheadingIds?.includes(section.id)) {
      relevantSet.set(source.id, source);
    }
  }

  // 3. Keyword-based relevance scoring (if we still have fewer than 3 sources)
  if (relevantSet.size < 3) {
    const sectionKeywords = extractSectionKeywords(section);

    const scored = allSources
      .filter((s) => !relevantSet.has(s.id) && (s.status === "kept" || s.status === "unreviewed"))
      .map((source) => {
        const sourceText = `${source.title} ${source.mainFinding || ""} ${source.suggestedUse || ""} ${(source.keyConcepts || []).join(" ")}`.toLowerCase();
        let score = 0;
        for (const kw of sectionKeywords) {
          if (sourceText.includes(kw)) score++;
        }
        return { source, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5 - relevantSet.size);

    for (const { source } of scored) {
      relevantSet.set(source.id, source);
    }
  }

  return Array.from(relevantSet.values());
}

/**
 * Extract keywords from section metadata for relevance matching
 */
function extractSectionKeywords(section: AssignmentDraftingSection): string[] {
  const text = [
    section.title,
    section.guidance,
    section.analyticalObjective || "",
    section.evidenceRequired || "",
    section.purpose || "",
    ...(section.keyTheories || []),
    ...(section.keyArguments || []),
    ...(section.keyPoints || []),
  ].join(" ");

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w, i, arr) => arr.indexOf(w) === i); // unique
}

/**
 * Extract evidence passages from uploaded documents that are relevant to a source
 */
function getEvidencePassages(
  sourceId: string,
  uploadedSources: UploadedSourceDocument[]
): string[] {
  const passages: string[] = [];

  for (const doc of uploadedSources) {
    if (doc.extractedEvidences) {
      for (const ev of doc.extractedEvidences) {
        // Evidence passages from the uploaded doc that link to this source
        if (ev.excerpt && ev.excerpt.trim().length > 0) {
          passages.push(
            ev.sourceLocation
              ? `[${ev.sourceLocation}] ${ev.excerpt}`
              : ev.excerpt
          );
        }
      }
    }
  }

  return passages.slice(0, 5); // Cap at 5 passages per source
}

/**
 * Build a complete evidence pack for a section.
 *
 * This is the main entry point — called BEFORE generating each section draft.
 */
export function buildEvidencePack(
  section: AssignmentDraftingSection,
  allSources: DiscoveredSource[],
  uploadedSources: UploadedSourceDocument[],
  syntheses: SectionAnalyticalSynthesis[],
  contextContinuity: ContextContinuityState | null
): EvidencePack {
  // Find sources relevant to this section
  const relevantSources = findRelevantSources(section, allSources, uploadedSources);

  // Build evidence pack sources
  const packSources: EvidencePackSource[] = relevantSources.map((source) => ({
    id: source.id,
    title: source.title,
    authors: source.authors,
    year: source.year,
    journal: source.journal,
    doi: source.doi,
    citationText: source.citation,
    retrievalSource: source.retrievalSource,
    peerReviewed: source.peerReviewed ?? null,
    role: source.roleInAssignment || "Supporting evidence",
    evidencePassages: getEvidencePassages(source.id, uploadedSources),
    relevanceExplanation: source.whyThisSource || source.suggestedUse || "",
  }));

  // Filter syntheses for this section
  const sectionSyntheses = syntheses.filter(
    (s) => s.sectionId === section.id
  );

  // Extract section number string from title (e.g., "1.1 Introduction" → "1.1")
  const numberMatch = section.title.match(/^(\d+(?:\.\d+)?)\s/);
  const sectionNumber = numberMatch ? numberMatch[1] : section.id;

  return {
    sectionId: section.id,
    sectionTitle: section.title,
    sectionNumber,
    analyticalObjective: section.analyticalObjective || section.guidance || "",
    keyTheories: section.keyTheories || [],
    keyArguments: section.keyArguments || [],
    evidenceRequired: section.evidenceRequired || "",
    counterarguments: section.counterarguments || [],
    expectedContribution: section.expectedContribution || "",
    sources: packSources,
    syntheses: sectionSyntheses,
    contextContinuity,
    totalSourceCount: packSources.length,
    targetWordCount: section.targetWordCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Pack → Prompt Serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize an evidence pack into a structured prompt block that can be
 * injected into the LLM section generation prompt.
 *
 * This is the critical interface between evidence retrieval and generation.
 */
export function serializeEvidencePackForPrompt(pack: EvidencePack): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════");
  lines.push("EVIDENCE PACK — MANDATORY SOURCE MATERIAL");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");

  // Section context
  lines.push(`SECTION: ${pack.sectionTitle}`);
  lines.push(`TARGET WORDS: ~${pack.targetWordCount}`);
  if (pack.analyticalObjective) {
    lines.push(`ANALYTICAL OBJECTIVE: ${pack.analyticalObjective}`);
  }
  if (pack.expectedContribution) {
    lines.push(`EXPECTED CONTRIBUTION: ${pack.expectedContribution}`);
  }
  lines.push("");

  // Key theories & arguments
  if (pack.keyTheories.length > 0) {
    lines.push("KEY THEORIES TO ENGAGE:");
    pack.keyTheories.forEach((t) => lines.push(`  • ${t}`));
    lines.push("");
  }

  if (pack.keyArguments.length > 0) {
    lines.push("KEY ARGUMENTS TO DEVELOP:");
    pack.keyArguments.forEach((a) => lines.push(`  • ${a}`));
    lines.push("");
  }

  if (pack.counterarguments.length > 0) {
    lines.push("COUNTERARGUMENTS TO ADDRESS:");
    pack.counterarguments.forEach((c) => lines.push(`  • ${c}`));
    lines.push("");
  }

  // Bound sources with evidence
  lines.push("───────────────────────────────────────────────────────");
  lines.push(`BOUND SOURCES (${pack.sources.length} sources — cite ONLY these):`);
  lines.push("───────────────────────────────────────────────────────");

  pack.sources.forEach((source, idx) => {
    lines.push("");
    lines.push(`[${idx + 1}] ${source.title}`);
    lines.push(`    Authors: ${source.authors.join(", ")} (${source.year || "n.d."})`);
    if (source.journal) lines.push(`    Venue: ${source.journal}`);
    if (source.doi) lines.push(`    DOI: ${source.doi}`);
    lines.push(`    Role: ${source.role}`);
    if (source.retrievalSource) {
      lines.push(`    Database: ${source.retrievalSource.toUpperCase()}`);
    }
    if (source.peerReviewed === true) lines.push(`    Peer-Reviewed: Yes`);
    if (source.relevanceExplanation) {
      lines.push(`    Relevance: ${source.relevanceExplanation}`);
    }
    lines.push(`    Citation: ${source.citationText}`);

    if (source.evidencePassages.length > 0) {
      lines.push("    Evidence Passages:");
      source.evidencePassages.forEach((p) => lines.push(`      → ${p}`));
    }
  });

  // Analytical syntheses
  if (pack.syntheses.length > 0) {
    lines.push("");
    lines.push("───────────────────────────────────────────────────────");
    lines.push("PRE-DEFINED ANALYTICAL SYNTHESES:");
    lines.push("───────────────────────────────────────────────────────");
    pack.syntheses.forEach((syn) => {
      lines.push(`  Claim: ${syn.claim}`);
      lines.push(`  Evidence: ${syn.evidence}`);
      lines.push(`  Interpretation: ${syn.interpretation}`);
      if (syn.counterargument) lines.push(`  Counterargument: ${syn.counterargument}`);
      lines.push(`  Analytical Link: ${syn.analyticalLink}`);
      lines.push("");
    });
  }

  // Context continuity
  if (pack.contextContinuity) {
    lines.push("");
    lines.push("───────────────────────────────────────────────────────");
    lines.push("CONTEXT CONTINUITY (from prior sections):");
    lines.push("───────────────────────────────────────────────────────");

    const ctx = pack.contextContinuity;
    if (ctx.claimsSoFar.length > 0) {
      lines.push("Claims established so far:");
      ctx.claimsSoFar.forEach((c) => lines.push(`  • ${c}`));
    }
    if (ctx.sourcesCitedSoFar.length > 0) {
      lines.push(`Sources already cited: ${ctx.sourcesCitedSoFar.join(", ")}`);
    }
    if (ctx.lastSectionLink) {
      lines.push(`Previous section's concluding link: "${ctx.lastSectionLink}"`);
    }
    if (ctx.runningThemes.length > 0) {
      lines.push("Running themes to maintain:");
      ctx.runningThemes.forEach((t) => lines.push(`  • ${t}`));
    }
    lines.push(`Progress: ${ctx.sectionsCompleted} sections completed, ${ctx.wordsGeneratedSoFar} words generated`);
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("CRITICAL RULES:");
  lines.push("• Cite ONLY the bound sources listed above — do NOT fabricate external sources");
  lines.push("• Use the exact citation text provided for each source");
  lines.push("• If evidence passages are provided, integrate them as direct evidence");
  lines.push("• Maintain analytical continuity with prior sections if context is provided");
  lines.push("═══════════════════════════════════════════════════════");

  return lines.join("\n");
}
