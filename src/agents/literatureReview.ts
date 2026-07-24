/**
 * Literature Review Agent
 * 
 * Primary engine for literature discovery, evidence synthesis, and gap identification.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { LiteratureReviewSkillInput } from "../skills/literatureReviewSkill";
import { discoverLiterature, type LiteratureResult } from "../services/literatureRetrievalService";

// ============================================================================
// Literature Review Types
// ============================================================================

export type EvidenceQuality = "high" | "medium" | "low";

export type StudyMethodology =
  | "experimental"
  | "quasi-experimental"
  | "observational"
  | "theoretical"
  | "review"
  | "meta-analysis"
  | "case-study";

export interface StudyClassification {
  methodology: StudyMethodology;
  publicationType: string;
  discipline: string;
  publicationYear: number;
}

export interface LiteratureTheme {
  id: string;
  name: string;
  description: string;
  studies: string[]; // reference IDs
  confidence: number;
}

export interface EvidenceMap {
  methodologyDistribution: Record<StudyMethodology, number>;
  yearDistribution: Record<number, number>;
  journalDistribution: Record<string, number>;
}

export interface ResearchGap {
  id: string;
  description: string;
  relatedThemes: string[];
  suggestedSearchTerms: string[];
  evidenceSupport?: string[];
}

export interface ConflictingFinding {
  id: string;
  claim: string;
  supportingStudies: string[];
  opposingStudies: string[];
}

export interface LiteratureReview {
  executiveSummary: string;
  keyFindings: string[];
  themes: LiteratureTheme[];
  evidenceMap: EvidenceMap;
  researchGaps: ResearchGap[];
  conflictingFindings: ConflictingFinding[];
  recommendedPapers: string[];
  recommendedJournals: string[];
  recommendedSearchTerms: string[];
  confidence: number;
  assumptions: string[];
  diagnostics: {
    localStudies: number;
    webStudies: number;
    duplicatesRemoved: number;
    avgEvidenceQuality: EvidenceQuality;
  };
}

// ============================================================================
// Literature Review Input
// ============================================================================

export interface LiteratureReviewInput {
  researchQuestions: string[];
  discipline?: string;
  minYear?: number;
  maxResults?: number;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Literature Provider Interface
// ============================================================================

export interface LiteratureProvider {
  search(query: string, options?: { discipline?: string; year?: number }): Promise<unknown[]>;
  getId(): string;
}

// ============================================================================
// Literature Review Agent
// ============================================================================

export class LiteratureReviewAgent implements Agent<LiteratureReviewInput, LiteratureReview> {
  metadata: AgentMetadata = {
    id: "literature-review",
    name: "Literature Review Agent",
    description: "Discovers literature, synthesizes evidence, identifies research gaps",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: LiteratureReviewInput,
    context: AgentContext
  ): Promise<AgentResult<LiteratureReview>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the literature-review skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Get local studies from Knowledge Vault
    const localStudies = await context.getReferences?.() ?? [];

    // Get web studies if available
    let webStudies: unknown[] = [];
    if (input.executionMode !== "deterministic") {
      webStudies = await this.fetchWebStudies(input, context);
    }

    const skillInput: LiteratureReviewSkillInput = {
      researchQuestions: input.researchQuestions,
      discipline: input.discipline,
      minYear: input.minYear,
      maxResults: input.maxResults,
      localStudies,
      webStudies,
    };

    const result: SkillResult<LiteratureReview> = await context.runSkill<LiteratureReview>("literature-review", skillInput);
    const executionTimeMs = Date.now() - startTime;

    if (result.ok === false) {
      return {
        ok: false,
        error: result.error,
        diagnostics: { modeUsed: input.executionMode ?? "deterministic", executionTimeMs },
      };
    }

    return {
      ok: true,
      data: result.data,
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs,
        confidence: 0.85,
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  // Agent-UI adapter, Step 2a (docs/planning/agent-ui-adapter-scoping.md): this
  // was a stub returning []. Now calls the same real, fabrication-audit-verified
  // retrieval path panels already use (literatureRetrievalService.discoverLiterature
  // — Crossref/OpenAlex/PubMed/Semantic Scholar) rather than reimplementing
  // retrieval or inventing agent-local fetch logic. Mapped into the same
  // doi/url/title/publicationDate/kind shape mergeAndDeduplicate/classifyStudies
  // (literatureReviewSkill.ts) already expect from localStudies (CanonicalReference),
  // so dedup-by-doi works across local + web studies uniformly. Honest empty
  // array on failure or no results — never fabricated.
  private async fetchWebStudies(
    input: LiteratureReviewInput,
    context: AgentContext
  ): Promise<unknown[]> {
    const query = input.researchQuestions.filter(Boolean).join(" ");
    if (!query.trim()) return [];

    try {
      const { results } = await discoverLiterature(query);
      return results.map((r: LiteratureResult) => {
        const doiMatch = r.url.match(/^https?:\/\/(dx\.)?doi\.org\/(.+)$/i);
        return {
          kind: "journal-article",
          title: r.title,
          authors: r.authors,
          source: r.venue,
          journal: r.venue,
          url: r.url,
          doi: doiMatch ? doiMatch[2] : undefined,
          publicationDate: r.year || undefined,
          canonicalKey: doiMatch ? doiMatch[2] : r.url,
        };
      });
    } catch (err) {
      return [];
    }
  }
}