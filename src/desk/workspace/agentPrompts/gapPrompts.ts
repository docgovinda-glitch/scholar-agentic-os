/**
 * Gap Identification Prompt Builder
 *
 * Constructs prompts for client-side research gap analysis without sending
 * in-flight project answers or private research notes to the Scholar server.
 * Ingests discovered literature from Stage 2 to discover citation-grounded voids.
 */

export interface GapItem {
  id: string;
  title: string;
  gap_type: "empirical" | "theoretical" | "methodological" | "knowledge";
  description: string;
  why_it_matters?: string;
  proposed_approach?: string;
  grounding_sources?: string[];
  importance_score: number;
  feasibility_score?: number;
  status: "identified" | "selected" | "rejected";
}

export interface GapPromptOptions {
  workingTitle: string;
  researchArea: string;
  projectAnswers: Record<string, any>;
  focusArea?: string;
}

export function buildGapPrompts(options: GapPromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    workingTitle = "Untitled Research",
    researchArea = "the field",
    projectAnswers = {},
    focusArea,
  } = options;

  // Extract literature summary from Stage 2 if available
  let literatureContext = "No prior literature corpus provided.";
  if (projectAnswers.discovered_literature) {
    try {
      const parsed = typeof projectAnswers.discovered_literature === "string"
        ? JSON.parse(projectAnswers.discovered_literature)
        : projectAnswers.discovered_literature;

      if (Array.isArray(parsed) && parsed.length > 0) {
        literatureContext = parsed
          .slice(0, 15)
          .map(
            (item: any, idx: number) =>
              `[Source ${idx + 1}] "${item.title}" (${item.year || "n.d."}) by ${(item.authors || []).slice(0, 2).join(", ")} — Journal: ${item.journal || "N/A"}. Themes: ${(item.themes || []).join(", ")}. Abstract snippet: ${(item.abstract || "").slice(0, 180)}...`
          )
          .join("\n\n");
      }
    } catch (_) {}
  }

  const focusDirective = focusArea
    ? `\nCRITICAL FOCUS DIRECTIVE: Prioritize discovering gaps concentrated specifically in the sub-domain of "${focusArea}".`
    : "";

  const systemPrompt = `You are an expert academic gap analysis agent and editorial board director.
Your mission is to rigorously analyze the researcher's working title, scientific discipline, and discovered literature corpus to identify exactly 5 high-impact, publication-grade research gaps.

The 5 gaps MUST be distributed across the core academic gap typologies:
1. Empirical Gap: Unverified phenomena, missing observational benchmarks, or untested boundary conditions.
2. Theoretical Gap: Contradictory explanatory frameworks, unresolved theoretical tensions, or unexamined assumptions.
3. Methodological Gap: Measurement flaws, instrumentation limitations, or lack of robust causal/analytical protocols.
4. Knowledge Gap: Blindspots at the intersection of adjacent domains or unaddressed questions in the canon.

CRITICAL INSTRUCTIONS:
- Every gap MUST have a concise, compelling academic "title" (4 to 8 words).
- Every gap MUST articulate "why_it_matters" (scholarly consequences if left unaddressed).
- Every gap MUST propose an actionable "proposed_approach" explaining how an original study can resolve it.
- Link each gap to 1 or 2 specific sources from the provided literature corpus in "grounding_sources".${focusDirective}

Return ONLY valid JSON matching this exact format:
{
  "data": [
    {
      "id": "gap-1",
      "title": "Sub-Second Consensus Under Asymmetric Partitions",
      "gap_type": "empirical",
      "description": "While existing BFT consensus algorithms provide theoretical safety, their performance degrades exponentially under asymmetric network partitions with high packet loss.",
      "why_it_matters": "Prevents mission-critical edge deployments from maintaining high-throughput transactional guarantees during physical topology shocks.",
      "proposed_approach": "Develop a lightweight adaptive gossip-partition detector that dynamically reweights quorum thresholds.",
      "grounding_sources": ["Byzantine Fault-Tolerant Consensus at Scale (Lamport et al.)"],
      "importance_score": 92,
      "feasibility_score": 85,
      "status": "identified"
    }
  ]
}`;

  const userPrompt = `Synthesize 5 publication-ready research gaps for:
Working Title: ${workingTitle}
Research Area: ${researchArea}
Primary Research Question: ${projectAnswers.primary_research_question || "Not specified"}
Article Type: ${projectAnswers.article_type || "Original Research"}
Study Design: ${projectAnswers.study_design || "General empirical"}

Assembled Literature Corpus from Stage 2:
${literatureContext}`;

  return { systemPrompt, userPrompt };
}

