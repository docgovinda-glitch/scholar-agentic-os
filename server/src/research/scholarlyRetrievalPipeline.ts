/**
 * AskScholar Retrieval-Grounded Architecture & Anti-Hallucination Pipeline
 *
 * Implements Perplexity/Consensus-grade scholarly grounding for Ask Scholar:
 * 1. Intent Detection: Identifies requests for essays, papers, proposals, theses, or presentations.
 * 2. Retrieval-First Ingestion: Discovers verified canonical works from OpenAlex, Crossref, and Vault.
 * 3. Exclusive Citation Ledger: Injects retrieved works into system prompts as the only allowable sources.
 * 4. Anti-Hallucination Citation Lock: Strips or converts fabricated (Author, Year) citations to [Unverified Claim].
 * 5. Scholarly Voice Enforcement: Applies British English, Unicode NFC diacritic preservation, and cliché suppression.
 * 6. True Telemetry: Calculates exact deterministic word count, burstiness metrics, and verified reference lists.
 */

import { discoverMultiPortalSources, type DiscoveredSourceDraft } from "../discovery/discovery.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
  evaluateBurstiness,
} from "../utils/scholarlyVoiceGuard.ts";
import { CitationFormatterFactory } from "../../../src/citation_compliance/formattingEngine.ts";
import type { CanonicalReference, ReferenceAuthor } from "../../../src/citation_compliance/model/reference.ts";

export interface DeliverableHandoff {
  targetFormatId: "OT-01" | "OT-10" | "OT-15" | "OT-07" | "OT-22";
  formatLabel: string;
  topic: string;
  suggestedTitle: string;
  wordCountTarget?: number;
  citationStyle: string;
  retrievedSources: Array<{
    title: string;
    authors: string[];
    year?: number | string;
    doi?: string;
    url?: string;
    venue?: string;
  }>;
}

export interface GroundedScholarSource {
  id: string;
  title: string;
  authors: string[];
  year?: number | string;
  doi?: string;
  url?: string;
  venue?: string;
  sourceType: "scholarly" | "official" | "vault" | "web";
  canonicalReference: CanonicalReference;
  inTextCitation: string;
  authorKeys: string[];
}

export interface GroundedScholarResult {
  text: string;
  wordCount: number;
  verifiedSourcesCount: number;
  burstinessMetrics: {
    averageLength: number;
    variance: number;
    burstinessScore: number;
    isSufficientlyBurst: boolean;
  };
  citations: GroundedScholarSource[];
  recommendedWorkspaceHandoff?: DeliverableHandoff;
}

/**
 * Detects whether a user prompt requests a long-form academic deliverable.
 */
export function detectDeliverableIntent(prompt: string): DeliverableHandoff | null {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  // Extract explicit word count target (e.g., "1,500 words", "2000-word", "1500 words")
  let wordCountTarget: number | undefined;
  const wordCountMatch = lower.match(/\b([\d,]+)\s*(?:-|–|\s)?(?:words?|word)\b/);
  if (wordCountMatch) {
    const parsed = parseInt(wordCountMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(parsed) && parsed >= 100 && parsed <= 50000) {
      wordCountTarget = parsed;
    }
  }

  // Helper to extract subject after trigger verbs
  const extractTopic = (raw: string, triggerPattern: RegExp): string => {
    const match = raw.match(triggerPattern);
    if (match && match[1]) {
      return match[1]
        .replace(/^(?:about|on|regarding|discussing|explaining|for)\s+/i, "")
        .replace(/\b(?:in\s+)?(?:apa|mla|chicago|harvard|ieee|vancouver)(?:\s+\d+th)?\b/gi, "")
        .replace(/\b(?:with\s+)?(?:references|citations|bibliography)\b/gi, "")
        .replace(/\b(?:[\d,]+)\s*(?:-|–|\s)?(?:words?|word)\b/gi, "")
        .replace(/[.,;?!]+$/, "")
        .trim();
    }
    return raw.slice(0, 120).trim();
  };

  // 1. Research Proposal (OT-15)
  if (
    lower.includes("research proposal") ||
    lower.includes("grant proposal") ||
    lower.includes("funding proposal") ||
    lower.includes("specific aims")
  ) {
    const topic = extractTopic(p, /(?:research proposal|grant proposal|funding proposal|specific aims)(?:\s+(?:on|about|for))?\s+([^.?!]+)/i) || p;
    return {
      targetFormatId: "OT-15",
      formatLabel: "Research Proposal Workspace",
      topic: topic || "Investigative Research Proposal",
      suggestedTitle: `Research Proposal: ${capitalizeTitle(topic || "Scholarly Inquiry")}`,
      wordCountTarget: wordCountTarget || 3500,
      citationStyle: "apa",
      retrievedSources: [],
    };
  }

  // 2. Thesis & Dissertation (OT-07)
  if (
    /\b(?:thesis|theses|dissertation|viva voce)\b/i.test(lower) ||
    /\bchapter\s+\d+\b/i.test(lower)
  ) {
    const topic = extractTopic(p, /(?:thesis|dissertation|chapter\s+\d+)(?:\s+(?:on|about|for))?\s+([^.?!]+)/i) || p;
    return {
      targetFormatId: "OT-07",
      formatLabel: "Thesis & Dissertation Workspace",
      topic: topic || "Doctoral Dissertation",
      suggestedTitle: `Doctoral Thesis: ${capitalizeTitle(topic || "Scholarly Investigation")}`,
      wordCountTarget: wordCountTarget || 8000,
      citationStyle: "harvard",
      retrievedSources: [],
    };
  }

  // 3. Presentation Studio (OT-22)
  if (
    lower.includes("presentation") ||
    lower.includes("slide deck") ||
    lower.includes("slides on") ||
    lower.includes("conference slides")
  ) {
    const topic = extractTopic(p, /(?:presentation|slide deck|slides)(?:\s+(?:on|about|for))?\s+([^.?!]+)/i) || p;
    return {
      targetFormatId: "OT-22",
      formatLabel: "Academic Presentation Studio",
      topic: topic || "Academic Presentation",
      suggestedTitle: capitalizeTitle(topic || "Conference Presentation"),
      wordCountTarget: wordCountTarget || 800,
      citationStyle: "apa",
      retrievedSources: [],
    };
  }

  // 4. Empirical Journal Article (OT-10)
  if (
    lower.includes("journal article") ||
    lower.includes("empirical paper") ||
    lower.includes("peer-reviewed paper") ||
    lower.includes("scientific manuscript")
  ) {
    const topic = extractTopic(p, /(?:journal article|empirical paper|manuscript|scientific paper)(?:\s+(?:on|about|for))?\s+([^.?!]+)/i) || p;
    return {
      targetFormatId: "OT-10",
      formatLabel: "Journal Article Workspace",
      topic: topic || "Empirical Research Article",
      suggestedTitle: `Empirical Investigation: ${capitalizeTitle(topic || "Research Study")}`,
      wordCountTarget: wordCountTarget || 5000,
      citationStyle: "apa",
      retrievedSources: [],
    };
  }

  // 5. Coursework & Essay Engine (OT-01) — Matches essay, coursework, assignment, literature review
  const essayTriggers = [
    /\b(?:write|draft|generate|compose|create)\s+(?:an?\s+)?(?:[\d,]+\s*-?\s*word\s+)?(?:essay|paper|coursework|assignment|term paper|critique|analytical essay)\b/i,
    /\b(?:essay|coursework|term paper)\s+(?:on|about|regarding)\b/i,
    /\b(?:literature review|critical review|thematic synthesis)\s+(?:on|about)\b/i,
  ];

  if (essayTriggers.some((t) => t.test(lower))) {
    const topic =
      extractTopic(p, /(?:essay|paper|coursework|assignment|literature review|term paper)(?:\s+(?:on|about|regarding|discussing))?\s+([^.?!]+)/i) || p;
    return {
      targetFormatId: "OT-01",
      formatLabel: "4-Phase Coursework Engine",
      topic: topic || "Academic Essay",
      suggestedTitle: `An Academic Analysis of ${capitalizeTitle(topic || "the Core Subject")}`,
      wordCountTarget: wordCountTarget || 1500,
      citationStyle: "apa",
      retrievedSources: [],
    };
  }

  return null;
}

function capitalizeTitle(str: string): string {
  if (!str) return "Scholarly Inquiry";
  return str
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

/**
 * Checks whether an inquiry is substantive academic research that requires retrieval.
 */
export function isSubstantiveAcademicQuery(prompt: string): boolean {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  // If deliverable intent detected, always substantive
  if (detectDeliverableIntent(p) !== null) {
    return true;
  }

  // Platform FAQ questions are NOT substantive research queries
  const platformPhrases = [
    "how do i set up ai",
    "how to set up ai",
    "configure ai",
    "ai provider",
    "byok",
    "what is knowledge vault",
    "how to create a research project",
    "where can i find my projects",
    "what is scholar ai engine",
    "what does this feature do",
  ];
  if (platformPhrases.some((phrase) => lower.includes(phrase))) {
    return false;
  }

  // Substantive research triggers
  const academicTerms = [
    "history",
    "evolution",
    "political",
    "party",
    "government",
    "policy",
    "constitution",
    "nepal",
    "congress",
    "election",
    "parliament",
    "democracy",
    "quantum",
    "biology",
    "physics",
    "chemistry",
    "economics",
    "literature",
    "philosophy",
    "psychology",
    "sociology",
    "medicine",
    "clinical",
    "empirical",
    "study",
    "research",
    "findings",
    "evidence",
    "mechanism",
    "model",
    "theory",
    "framework",
    "analysis",
    "critique",
    "impact of",
    "effects of",
    "causes of",
    "role of",
    "versus",
    "vs",
    "comparison",
    "how does",
    "why did",
    "what were",
  ];

  if (academicTerms.some((t) => lower.includes(t))) {
    return true;
  }

  // Queries with >= 4 words that aren't simple greetings
  const words = p.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && !lower.startsWith("hello") && !lower.startsWith("hi")) {
    return true;
  }

  return false;
}

/**
 * Concurrently queries OpenAlex, Crossref, and local Vault to retrieve real canonical sources.
 */
export async function retrieveCanonicalSourcesForPrompt(
  query: string,
  options: {
    maxResults?: number;
    vaultItems?: Array<{ title?: string; authors?: string[]; year?: string | number; doi?: string; url?: string; content?: string }>;
    citationStyle?: string;
  } = {}
): Promise<GroundedScholarSource[]> {
  const { maxResults = 8, vaultItems = [], citationStyle = "apa" } = options;

  let drafts: DiscoveredSourceDraft[] = [];
  try {
    drafts = await discoverMultiPortalSources(query, maxResults * 2);
  } catch {
    drafts = [];
  }

  const sources: GroundedScholarSource[] = [];
  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();

  // 1. Process Vault items if any match query terms
  if (vaultItems.length > 0) {
    const qTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    for (const v of vaultItems) {
      const vText = `${v.title || ""} ${v.content || ""}`.toLowerCase();
      const matchScore = qTokens.filter((tok) => vText.includes(tok)).length;
      if (matchScore > 0 && v.title) {
        const cleanDoi = v.doi?.toLowerCase().trim();
        const normTitle = v.title.toLowerCase().trim();
        if (cleanDoi && seenDois.has(cleanDoi)) continue;
        if (normTitle && seenTitles.has(normTitle)) continue;

        if (cleanDoi) seenDois.add(cleanDoi);
        seenTitles.add(normTitle);

        const authors = Array.isArray(v.authors) ? v.authors : [];
        const canonicalRef: CanonicalReference = {
          kind: v.doi ? "JournalArticle" : "Website",
          title: v.title,
          source: "Knowledge Vault",
          authors: authors.map((a, i) => {
            const parts = a.trim().split(" ");
            return {
              firstName: parts.slice(0, -1).join(" "),
              lastName: parts[parts.length - 1] || a,
              order: i + 1,
            };
          }),
          year: v.year ? String(v.year) : undefined,
          doi: v.doi,
          url: v.url,
        };

        const authorKeys = authors
          .map((a) => {
            const parts = a.trim().split(" ");
            return (parts[parts.length - 1] || a).toLowerCase().replace(/[^a-z]/g, "");
          })
          .filter(Boolean);

        let inTextCitation = "";
        try {
          inTextCitation = CitationFormatterFactory.formatInText(citationStyle, canonicalRef);
        } catch {
          const firstAuthor = authorKeys[0] ? authorKeys[0].toUpperCase() : "Vault Source";
          inTextCitation = `(${firstAuthor}, ${v.year || "n.d."})`;
        }

        sources.push({
          id: `vault-${sources.length + 1}`,
          title: v.title,
          authors,
          year: v.year,
          doi: v.doi,
          url: v.url,
          sourceType: "vault",
          canonicalReference: canonicalRef,
          inTextCitation,
          authorKeys,
        });
      }
    }
  }

  // 2. Process Multi-Portal Discovered Sources (OpenAlex / CrossRef / arXiv)
  for (const draft of drafts) {
    if (sources.length >= maxResults) break;

    const cleanDoi = draft.doi ? draft.doi.toLowerCase().trim() : null;
    const normTitle = (draft.title || "").toLowerCase().replace(/[\W_]+/g, " ").trim();

    if (cleanDoi && seenDois.has(cleanDoi)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    if (cleanDoi) seenDois.add(cleanDoi);
    if (normTitle) seenTitles.add(normTitle);

    const authors = Array.isArray(draft.authors) ? draft.authors : [];
    const canonicalRef: CanonicalReference = {
      kind: draft.sourceType === "scholarly" ? "JournalArticle" : "Website",
      title: draft.title || "Untitled Source",
      source: draft.venue || (draft.discoveredVia ? `Discovered via ${draft.discoveredVia}` : "Scholarly Literature"),
      journal: draft.venue,
      authors: authors.map((a, i) => {
        const parts = a.trim().split(" ");
        return {
          firstName: parts.slice(0, -1).join(" "),
          lastName: parts[parts.length - 1] || a,
          order: i + 1,
        };
      }),
      year: draft.year ? String(draft.year) : undefined,
      publicationDate: draft.year ? `${draft.year}-01-01` : undefined,
      doi: draft.doi,
      url: draft.url,
    };

    const authorKeys = authors
      .map((a) => {
        const parts = a.trim().split(" ");
        return (parts[parts.length - 1] || a).toLowerCase().replace(/[^a-z]/g, "");
      })
      .filter(Boolean);

    let inTextCitation = "";
    try {
      inTextCitation = CitationFormatterFactory.formatInText(citationStyle, canonicalRef);
    } catch {
      const firstAuthor = authors[0] ? authors[0].split(" ").pop() : "Scholar Source";
      inTextCitation = `(${firstAuthor}, ${draft.year || "n.d."})`;
    }

    sources.push({
      id: `src-${sources.length + 1}`,
      title: draft.title || "Untitled Source",
      authors,
      year: draft.year,
      doi: draft.doi,
      url: draft.url,
      venue: draft.venue,
      sourceType: "scholarly",
      canonicalReference: canonicalRef,
      inTextCitation,
      authorKeys,
    });
  }

  return sources;
}

/**
 * Builds the canonical system prompt enforcing the Exclusive Citation Ledger and anti-hallucination rules.
 */
export function buildGroundedAskScholarSystemPrompt(
  sources: GroundedScholarSource[],
  intent: DeliverableHandoff | null,
  citationStyle = "apa"
): string {
  const scholarlyMandate = buildScholarlyVoiceSystemPrompt({ dialect: "en-GB" });

  let ledgerText = "";
  if (sources.length > 0) {
    ledgerText = `
[EXCLUSIVE CITATION LEDGER — RETRIEVED CANONICAL SOURCES]
The following ${sources.length} sources have been retrieved from verified academic databases (OpenAlex, Crossref, Vault):
${sources
  .map(
    (s, idx) =>
      `${idx + 1}. [${s.id}]: ${s.inTextCitation} — "${s.title}" by ${s.authors.join(", ") || "(author not recorded)"} (${s.year || "year not recorded"}). DOI: ${s.doi || "N/A"}. URL: ${s.url || "N/A"}`
  )
  .join("\n")}

STRICT ANTI-HALLUCINATION & CITATION INTEGRITY MANDATE:
1. EXCLUSIVE CITATION RESTRICTION: You may ONLY cite authors, papers, and works that exist in the Exclusive Citation Ledger above.
2. ABSOLUTE BAN ON PHANTOM CITATIONS: Never fabricate or hallucinate any (Author, Year) or [N] citation. If a scholar, statistic, or paper is not in the ledger, DO NOT invent a parenthetical citation for it.
3. UNSOURCED CLAIMS: If a statistic, date or factual claim is not supported by the ledger, leave it out or state it cautiously without a citation. Never write placeholder tags.
4. NO PSEUDO WORD-COUNT DECLARATIONS: Do NOT print artificial headers or footers declaring estimated word counts (e.g. "Word count: ≈1,600"). The system calculates true word counts deterministically.
`.trim();
  } else {
    ledgerText = `
[EXCLUSIVE CITATION LEDGER — ZERO SOURCES RETRIEVED]
No external sources were retrieved from OpenAlex/Crossref for this query.
STRICT ANTI-HALLUCINATION MANDATE:
1. You MUST NOT invent any parenthetical author citations (e.g., "(Smith, 2020)") or fake literature references.
2. Formulate your analysis as an analytical, theoretical, and conceptual overview.
3. Do not state specific statistics you cannot source; never write placeholder tags.
`.trim();
  }

  let deliverableGuidance = "";
  if (intent) {
    deliverableGuidance = `
[DELIVERABLE INTENT: ${intent.formatLabel.toUpperCase()} — ${intent.suggestedTitle}]
The user is requesting an academic deliverable (${intent.formatLabel}).
In Ask Scholar, deliver a comprehensive, research-grade "Executive Scholarly Synthesis & Verified Literature Brief" designed to ground their work before full workspace execution:
- Include:
  1. Executive Historiographical & Conceptual Overview (framing the central academic debates).
  2. Thematic & Methodological Matrix (synthesizing evidence from the retrieved ledger).
  3. Critical Analytical Synthesis (evaluating divergent scholarly interpretations).
  4. Conclusion & Structural Roadmap (advising on how to develop this into a complete ${intent.formatLabel} project).
- Completeness: Ensure the response includes a full conclusion and does not truncate prematurely.
`.trim();
  }

  return `
${scholarlyMandate}

${ledgerText}

${deliverableGuidance}
`.trim();
}

/**
 * Sanitizes the LLM response, purging hallucinated citations, stripping fake word counts,
 * enforcing scholarly voice, computing true metrics, and appending Verified References.
 */
export function sanitizeAndLockScholarResponse(
  rawText: string,
  sources: GroundedScholarSource[],
  citationStyle = "apa",
  intent: DeliverableHandoff | null = null
): GroundedScholarResult {
  let text = normalizeUnicodeNFC(rawText || "");

  // 1. Strip fake word-count declarations (e.g., "Word count: ≈1,600", "**Word Count:** 1500 words")
  text = text
    .replace(/^(?:\*{0,2}|_{0,2})\s*Word\s+[Cc]ount\s*:?\s*(?:\*{0,2}|_{0,2})\s*[≈~]?\s*[\d,]+\s*(?:words)?\s*\n?/gim, "")
    .replace(/\n(?:\*{0,2}|_{0,2})\s*Word\s+[Cc]ount\s*:?\s*(?:\*{0,2}|_{0,2})\s*[≈~]?\s*[\d,]+\s*(?:words)?\s*$/gim, "");

  // 2. Anti-Hallucination Citation Filter:
  // Collect all valid author surnames from the ledger
  const validAuthorSurnames = new Set<string>();
  sources.forEach((s) => {
    s.authorKeys.forEach((key) => validAuthorSurnames.add(key));
  });

  const citedSources = new Set<GroundedScholarSource>();

  // Regex to match parenthetical citations like (Shrestha, 2022), (Dahal & Smith, 2018), (Bhandari et al., 2020)
  const citationPattern = /\(([A-Z][A-Za-z\s&,.-]+?(?:et al\.)?,\s*(?:19|20)\d{2}[a-z]?)\)/g;

  text = text.replace(citationPattern, (match, citeContent) => {
    // Extract author segment before comma
    const commaIdx = citeContent.lastIndexOf(",");
    const authorPart = commaIdx !== -1 ? citeContent.slice(0, commaIdx) : citeContent;
    const authorWords = authorPart
      .toLowerCase()
      .replace(/et al\.?/g, "")
      .replace(/&/g, " ")
      .split(/[\s,]+/)
      .filter((w: string) => w.length > 2);

    // Check if any author in the citation matches any author in the retrieved ledger
    const matchedSource = sources.find((src) =>
      src.authorKeys.some((k) => authorWords.includes(k))
    );

    if (matchedSource) {
      citedSources.add(matchedSource);
      return match; // Legitimate citation from ledger
    }

    // HALLUCINATED CITATION: the model invented an author not in the ledger.
    // Remove it; no placeholder tag is written into the prose.
    return "";
  });

  // Also check bracket ID tokens like [src-1], [1]
  const bracketNumPattern = /\[(\d+)\]/g;
  text = text.replace(bracketNumPattern, (match, numStr) => {
    const idx = parseInt(numStr, 10);
    if (idx >= 1 && idx <= sources.length) {
      const src = sources[idx - 1];
      if (src) citedSources.add(src);
      return match;
    }
    return "";
  });

  const bracketSrcPattern = /\[src-(\d+)\]/gi;
  text = text.replace(bracketSrcPattern, (match, numStr) => {
    const idx = parseInt(numStr, 10);
    if (idx >= 1 && idx <= sources.length) {
      const src = sources[idx - 1];
      if (src) citedSources.add(src);
      return match;
    }
    return "";
  });

  // 3. Strip any raw/unverified bibliography generated by the LLM
  const rawRefPattern = /(?:\n\s*---\s*\n)?\n\s*(?:##|###)\s*(?:References|References\s*&\s*Evidence\s*Base|Sources|Works\s*Cited|Bibliography)[\s\S]*$/i;
  text = text.replace(rawRefPattern, "").trim();

  // 4. Apply scholarly voice sanitization (British English, cliché removal, NFC Unicode)
  text = sanitizeScholarlyText(text, { dialect: "en-GB", stripCliches: true });
  text = normalizeUnicodeNFC(text);

  // 5. Append deterministic, verified bibliography for consulted/cited ledger sources
  const finalSourcesList: GroundedScholarSource[] =
    citedSources.size > 0 ? Array.from(citedSources) : sources.slice(0, 5);

  if (finalSourcesList.length > 0) {
    let referencesMarkdown = "\n\n---\n\n### Verified References & Literature Base\n";
    finalSourcesList.forEach((src, idx) => {
      let bibEntry = "";
      try {
        bibEntry = CitationFormatterFactory.formatBibliography(citationStyle, src.canonicalReference);
      } catch {
        bibEntry = `${src.title}. ${src.venue || "Academic Literature"}.`;
      }

      const alreadyHasLink = (src.doi && bibEntry.includes(src.doi)) || (src.url && bibEntry.includes(src.url));
      const linkPart = !alreadyHasLink && src.doi
        ? ` https://doi.org/${src.doi}`
        : !alreadyHasLink && src.url
        ? ` [Link](${src.url})`
        : "";

      referencesMarkdown += `${idx + 1}. ${bibEntry}${linkPart}\n`;
    });

    text += referencesMarkdown;
  }

  // 6. Calculate real, deterministic telemetry
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const burstinessMetrics = evaluateBurstiness(text);

  let handoff: DeliverableHandoff | undefined;
  if (intent) {
    handoff = {
      ...intent,
      retrievedSources: finalSourcesList.map((s) => ({
        title: s.title,
        authors: s.authors,
        year: s.year,
        doi: s.doi,
        url: s.url,
        venue: s.venue,
      })),
    };
  }

  return {
    text,
    wordCount,
    verifiedSourcesCount: finalSourcesList.length,
    burstinessMetrics,
    citations: finalSourcesList,
    recommendedWorkspaceHandoff: handoff,
  };
}
