/**
 * Literature Discovery Prompt Builder & Citation Formatters
 *
 * Constructs prompts for client-side literature discovery without sending
 * in-flight project answers or private research notes to the Scholar server.
 * Also provides reference export utilities for BibTeX, APA 7th, and Vancouver.
 */

export interface LiteratureItem {
  id: string;
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  journal: string;
  source: "vault" | "external";
  relevanceScore: number;
  themes: string[];
  abstract: string;
  isLandmark?: boolean;
  portal?: string;
  url?: string;
  citationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdfUrl?: string;
}


export interface LiteraturePromptOptions {
  workingTitle: string;
  researchArea: string;
  projectAnswers: Record<string, any>;
  isBroadened?: boolean;
  focusDiscipline?: string;
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
    focusDiscipline,
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

  const focusDirective = focusDiscipline
    ? `\nPRIORITY FOCUS DIRECTIVE: Prioritize publications and frameworks from the following adjacent or cross-cutting discipline: "${focusDiscipline}".`
    : "";

  const systemPrompt = isBroadened
    ? `You are an expert academic literature discovery and interdisciplinary research agent.
CRITICAL INSTRUCTION: The researcher has requested to BROADEN the literature search beyond the initial scope.${focusDirective}
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
  const userPrompt = `Working Title: ${workingTitle}\nResearch Area: ${researchArea}${
    focusDiscipline ? `\nTarget Focus: ${focusDiscipline}` : ""
  }\nContext: ${context}${
    isBroadened ? "\nMode: Broadened & Interdisciplinary Discovery" : ""
  }`;

  return { systemPrompt, userPrompt };
}

/**
 * Format literature items as BibTeX citations.
 */
export function formatAsBibtex(items: LiteratureItem[]): string {
  return items
    .map((item) => {
      const firstAuthorSurname =
        item.authors && item.authors.length > 0
          ? item.authors[0].split(" ").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "author"
          : "author";
      const citeKey = `${firstAuthorSurname}${item.year || 2025}${item.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4)}`;
      const authorsStr = (item.authors || ["Unknown Author"]).join(" and ");

      return `@article{${citeKey},
  title = {${item.title}},
  author = {${authorsStr}},
  journal = {${item.journal || "Journal Article"}},
  year = {${item.year || 2025}},${item.doi ? `\n  doi = {${item.doi}},` : ""}
  keywords = {${(item.themes || []).join(", ")}}
}`;
    })
    .join("\n\n");
}

/**
 * Format literature items as APA 7th edition references.
 */
export function formatAsApa(items: LiteratureItem[]): string {
  return items
    .map((item) => {
      const authorText =
        item.authors && item.authors.length > 0
          ? item.authors.join(", ")
          : "Unknown Author";
      const yearText = item.year ? `(${item.year})` : "(n.d.)";
      const doiText = item.doi ? ` https://doi.org/${item.doi}` : "";

      return `${authorText} ${yearText}. ${item.title}. ${item.journal || "Scholarly Journal"}.${doiText}`;
    })
    .join("\n\n");
}

/**
 * Format literature items as Vancouver style references.
 */
export function formatAsVancouver(items: LiteratureItem[]): string {
  return items
    .map((item, index) => {
      const authorText =
        item.authors && item.authors.length > 0
          ? item.authors.join(", ")
          : "Unknown";
      const doiText = item.doi ? ` doi: ${item.doi}` : "";

      return `${index + 1}. ${authorText}. ${item.title}. ${item.journal || "Scholarly Journal"}. ${item.year || 2025}.${doiText}`;
    })
    .join("\n\n");
}

/**
 * Normalizes title string for exact and fuzzy matching.
 */
function normalizeTitleKey(title?: string): string {
  if (!title) return "";
  return title.toLowerCase().replace(/[\W_]+/g, " ").trim();
}



