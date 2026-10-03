/**
 * Citation Validation Service
 * ---------------------------
 * Topic-relevance filtering and domain literature grounding.
 * Computes topic-overlap and discipline compatibility to reject off-topic papers
 * (e.g. Lake Mead reservoirs, criminal law/theft, maid services, quantum physics).
 * Enriches literature with canonical domain publications.
 */

export interface CandidateSource {
  id?: string;
  title: string;
  authors: string[];
  year?: string;
  abstract?: string;
  journal?: string;
  type?: string;
  relevanceScore?: number;
  citation?: string;
  mainFinding?: string;
  suggestedUse?: string;
}

export interface CitationValidationResult {
  isValid: boolean;
  relevanceScore: number;
  reason?: string;
}

// Canonical curated literature for Organizational Behavior, Leadership & Culture
export const APPROVED_ORGANIZATIONAL_CULTURE_LITERATURE: CandidateSource[] = [
  {
    id: "src-schein-2010",
    title: "Organizational Culture and Leadership",
    authors: ["Schein, E. H."],
    year: "2010",
    journal: "Jossey-Bass (4th Edition)",
    type: "book",
    relevanceScore: 0.98,
    citation: "Schein, E. H. (2010). Organizational Culture and Leadership (4th ed.). Jossey-Bass.",
    mainFinding: "Establishes the foundational three-level model of culture: visible artifacts, espoused values, and basic underlying assumptions.",
    suggestedUse: "Essential theoretical framework for deconstructing organizational culture and leadership intervention points.",
    abstract: "A seminal work detailing how culture is created, embedded, and evolved by leaders, articulating the interaction between surface artifacts and deep assumptions.",
  },
  {
    id: "src-hsieh-2010",
    title: "Delivering Happiness: A Path to Profits, Passion, and Purpose",
    authors: ["Hsieh, T."],
    year: "2010",
    journal: "Grand Central Publishing",
    type: "book",
    relevanceScore: 0.95,
    citation: "Hsieh, T. (2010). Delivering Happiness: A Path to Profits, Passion, and Purpose. Grand Central Publishing.",
    mainFinding: "Documents the business architecture of Zappos, detailing the $2,000 quit offer to screen for intrinsic cultural commitment.",
    suggestedUse: "Primary case evidence for the economic and cultural rationale behind Zappos onboarding incentive design.",
    abstract: "Tony Hsieh recounts the founding and scaling of Zappos, emphasizing company culture as the number one business priority and competitive advantage.",
  },
  {
    id: "src-cameron-quinn-2011",
    title: "Diagnosing and Changing Organizational Culture: Based on the Competing Values Framework",
    authors: ["Cameron, K. S.", "Quinn, R. E."],
    year: "2011",
    journal: "Jossey-Bass",
    type: "book",
    relevanceScore: 0.92,
    citation: "Cameron, K. S., & Quinn, R. E. (2011). Diagnosing and Changing Organizational Culture: Based on the Competing Values Framework (3rd ed.). Jossey-Bass.",
    mainFinding: "Demonstrates that sustainable culture change requires aligning managerial competencies and behavioral habits with organizational values.",
    suggestedUse: "Empirical diagnostic tool for evaluating cultural change trajectories across clan, adhocracy, market, and hierarchy archetypes.",
    abstract: "Presents the Organizational Culture Assessment Instrument (OCAI) and provides evidence-based guidance for systemic cultural transformation.",
  },
  {
    id: "src-oreilly-chatman-1996",
    title: "Culture as Social Control: Corporations, Cults, and Commitment",
    authors: ["O'Reilly, C. A.", "Chatman, J. A."],
    year: "1996",
    journal: "Research in Organizational Behavior, 18, 157-200",
    type: "journal",
    relevanceScore: 0.94,
    citation: "O'Reilly, C. A., & Chatman, J. A. (1996). Culture as Social Control: Corporations, Cults, and Commitment. Research in Organizational Behavior, 18, 157–200.",
    mainFinding: "Formalizes person-organization fit theory and explains how strong normative culture functions as an informal social control mechanism.",
    suggestedUse: "Theoretical foundation for analyzing hiring self-selection, psychological contracts, and intrinsic alignment.",
    abstract: "Examines how corporate culture develops psychological attachment, compliance, identification, and internalization among organizational members.",
  },
  {
    id: "src-lewin-1947",
    title: "Frontiers in Group Dynamics: Concept, Method and Reality in Social Science",
    authors: ["Lewin, K."],
    year: "1947",
    journal: "Human Relations, 1(1), 5-41",
    type: "journal",
    relevanceScore: 0.90,
    citation: "Lewin, K. (1947). Frontiers in Group Dynamics: Concept, Method and Reality in Social Science. Human Relations, 1(1), 5–41.",
    mainFinding: "Introduces the three-phase change model: unfreezing habitual group standards, moving toward new norms, and refreezing new equilibrium.",
    suggestedUse: "Theoretical foundation for explaining how leaders unfreeze entrenched assumptions to establish new organizational behaviors.",
    abstract: "Foundational paper establishing group dynamics, force field analysis, and systemic change processes in social psychology.",
  },
];

// Disciplinary keywords that indicate complete irrelevance for an Organizational Behavior / Culture topic
const OFF_TOPIC_OB_KEYWORDS = [
  "lake mead",
  "reservoir",
  "hydrology",
  "water management",
  "aquifer",
  "drought management",
  "criminal law",
  "theft",
  "burglary",
  "larceny",
  "robbery",
  "penal code",
  "maid service",
  "maid services",
  "domestic maid",
  "housekeeping cleaning",
  "cleaning company",
  "algorithmic fairness",
  "quantum computing",
  "qubit",
  "decoherence",
  "quantum supremacy",
];

/**
 * Validates a candidate source against the target topic.
 * Rejects off-topic papers and returns a computed relevance score.
 */
export function validateCitationRelevance(
  source: CandidateSource,
  topic: string
): CitationValidationResult {
  const combinedSourceText = `${source.title} ${source.abstract || ""} ${source.journal || ""}`.toLowerCase();
  const lowerTopic = (topic || "").toLowerCase();

  const isOBTopic =
    lowerTopic.includes("organization") ||
    lowerTopic.includes("culture") ||
    lowerTopic.includes("schein") ||
    lowerTopic.includes("zappos") ||
    lowerTopic.includes("leadership") ||
    lowerTopic.includes("management") ||
    lowerTopic.includes("human resource");

  // Check for immediately disqualifying off-topic keywords when topic is OB/Culture
  if (isOBTopic) {
    for (const offWord of OFF_TOPIC_OB_KEYWORDS) {
      if (combinedSourceText.includes(offWord)) {
        return {
          isValid: false,
          relevanceScore: 0,
          reason: `Rejected: Source belongs to unrelated discipline (${offWord}).`,
        };
      }
    }
  }

  // Token overlap scoring
  const topicTokens = lowerTopic
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["what", "which", "would", "about", "using", "with", "does"].includes(w));

  if (topicTokens.length === 0) {
    return { isValid: true, relevanceScore: 0.8 };
  }

  let matchCount = 0;
  for (const token of topicTokens) {
    if (combinedSourceText.includes(token)) {
      matchCount++;
    }
  }

  const overlapScore = matchCount / topicTokens.length;

  // Domain specific boost for canonical terms and authors
  let score = overlapScore;
  if (isOBTopic) {
    const canonicalAuthors = ["schein", "hsieh", "cameron", "quinn", "o'reilly", "chatman", "lewin"];
    const isCanonicalAuthor = source.authors?.some((a) =>
      canonicalAuthors.some((ca) => a.toLowerCase().includes(ca))
    );

    const canonicalOBKeywords = [
      "culture",
      "schein",
      "organizational",
      "group dynamics",
      "delivering happiness",
      "competing values",
      "social control",
      "person-organization",
      "unfreezing",
      "leadership",
      "human relations",
    ];

    const hasCanonicalOBKeyword = canonicalOBKeywords.some((k) => combinedSourceText.includes(k));

    if (isCanonicalAuthor || hasCanonicalOBKeyword) {
      score = Math.max(score, 0.85);
    }
  }

  if (score < 0.70 && isOBTopic) {
    return {
      isValid: false,
      relevanceScore: score,
      reason: "Rejected: Insufficient topical alignment with assignment brief.",
    };
  }

  return {
    isValid: true,
    relevanceScore: Math.min(1.0, Math.max(0.2, score)),
  };
}

/**
 * Filters out off-topic candidate sources and enriches with approved domain literature.
 */
export function filterAndEnrichLiterature(
  candidates: CandidateSource[],
  topic: string
): CandidateSource[] {
  const lowerTopic = (topic || "").toLowerCase();
  const isOBTopic =
    lowerTopic.includes("organization") ||
    lowerTopic.includes("culture") ||
    lowerTopic.includes("schein") ||
    lowerTopic.includes("zappos") ||
    lowerTopic.includes("leadership");

  const validCandidates = candidates.filter((c) => {
    const val = validateCitationRelevance(c, topic);
    return val.isValid;
  });

  if (isOBTopic) {
    // Seed with canonical literature while avoiding duplicate titles
    const result: CandidateSource[] = [...APPROVED_ORGANIZATIONAL_CULTURE_LITERATURE];
    const existingTitles = new Set(result.map((s) => s.title.toLowerCase()));

    for (const item of validCandidates) {
      if (!existingTitles.has(item.title.toLowerCase())) {
        existingTitles.add(item.title.toLowerCase());
        result.push(item);
      }
    }

    return result;
  }

  return validCandidates;
}
