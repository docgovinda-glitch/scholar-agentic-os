/**
 * Literature Discovery Prompt Builder
 *
 * Constructs prompts for client-side literature discovery without sending
 * in-flight project answers or private research notes to the Scholar server.
 */

export interface LiteraturePromptOptions {
  workingTitle: string;
  researchArea: string;
  projectAnswers: Record<string, any>;
  isBroadened?: boolean;
  excludeIds?: string[];
  excludeDois?: string[];
  excludeTitles?: string[];
}

export function buildLiteraturePrompts(options: LiteraturePromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    workingTitle = "Untitled Research",
    researchArea = "the field",
    projectAnswers = {},
    isBroadened = false,
    excludeIds = [],
    excludeDois = [],
    excludeTitles = [],
  } = options;

  const exclusionText =
    excludeDois.length > 0 || excludeIds.length > 0 || excludeTitles.length > 0
      ? `\nCRITICAL EXCLUSION LIST: The following DOIs, IDs, and titles have already been discovered or were removed by the researcher. You MUST NOT include them or close duplicates:\n- Excluded DOIs/IDs: ${
          [...excludeDois, ...excludeIds].filter(Boolean).join(", ") || "None"
        }\n- Excluded Titles: ${excludeTitles.filter(Boolean).slice(0, 30).join(" | ") || "None"}`
      : "";

  const systemPrompt = isBroadened
    ? `You are an expert academic literature discovery and interdisciplinary research agent.
CRITICAL INSTRUCTION: The researcher has requested to BROADEN the literature search beyond the initial scope.
1. Broaden your search strategy to cover BOTH:
   - The primary research field ("${researchArea}") using expanded terminology, sub-disciplines, and synonyms.
   - Closely related, adjacent, and interdisciplinary fields that offer foundational theories, comparative findings, or analogous methodologies.
2. Generate an extensive set of EXACTLY 15 newly discovered, high-impact scholarly sources.${exclusionText}
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "lit-xyz",
      "doi": "10.1000/xyz123",
      "title": "...",
      "authors": ["...", "..."],
      "year": 2025,
      "journal": "...",
      "source": "external",
      "relevanceScore": 90,
      "themes": ["...", "..."],
      "abstract": "..."
    }
  ],
  "meta": {
    "intentSignal": "broadened_interdisciplinary_search",
    "searchVariants": ["...", "..."]
  }
}`
    : `You are an expert academic literature discovery agent.
CRITICAL INSTRUCTION: You MUST closely analyze the exact "Working Title" and "Research Area" provided. The literature you discover MUST be highly specific and directly related to the keywords in the title.${exclusionText}
Based on the provided research context, working title, and research area, generate a comprehensive and realistic list of EXACTLY 15 discovered literature sources. This must be an extensive literature review.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "lit-xyz",
      "doi": "10.1000/xyz123",
      "title": "...",
      "authors": ["...", "..."],
      "year": 2025,
      "journal": "...",
      "source": "vault",
      "relevanceScore": 90,
      "themes": ["...", "..."],
      "abstract": "..."
    }
  ],
  "meta": {
    "intentSignal": "primary_literature_discovery",
    "searchVariants": ["...", "..."]
  }
}
CRITICAL INSTRUCTION: Generate exactly 15 highly relevant sources. Do not hallucinate irrelevant topics.`;

  const context = JSON.stringify(projectAnswers);
  const userPrompt = `Working Title: ${workingTitle}\nResearch Area: ${researchArea}\nContext: ${context}${
    isBroadened ? "\nMode: Broadened & Interdisciplinary Discovery" : ""
  }`;

  return { systemPrompt, userPrompt };
}
