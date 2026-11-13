/**
 * AskScholar Master Configuration: Source Budgets, Discipline Profiles,
 * Query Classification, and User Preference Settings.
 *
 * Single source of truth for dynamic retrieval budgets and discipline rules.
 */

export type AskScholarRequestType =
  | "simple_factual"
  | "standard_academic"
  | "literature_review"
  | "deep_research";

export type AskScholarQuestionType =
  | "empirical"
  | "theoretical"
  | "review"
  | "methods"
  | "policy"
  | "comparative"
  | "simple_factual";

export type AskScholarDisciplineId =
  | "stem"
  | "management_business"
  | "social_sciences"
  | "humanities"
  | "health"
  | "law"
  | "education"
  | "general";

export type AcademicDiscipline = AskScholarDisciplineId | "auto";

export type AnswerLengthPreference = "concise" | "standard" | "detailed";

export type ScholarlyProviderId =
  | "openalex"
  | "crossref"
  | "semantic_scholar"
  | "pubmed_europe_pmc"
  | "arxiv"
  | "core"
  | "doaj"
  | "ssrn"
  | "repec"
  | "eric"
  | "authoritative_web";

export interface SourceBudgetRange {
  requestType: AskScholarRequestType;
  label: string;
  candidatesRetrieved: {
    min: number;
    max: number;
  };
  sourcesReadAndCited: {
    min: number;
    max: number;
  };
}

/**
 * Canonical Source Budgets by Request Type (Section 3).
 * Never hardcode fixed source limits (such as 6) outside this configuration.
 */
export const SOURCE_BUDGET_CONFIG: Record<AskScholarRequestType, SourceBudgetRange> = {
  simple_factual: {
    requestType: "simple_factual",
    label: "Simple factual question",
    candidatesRetrieved: { min: 15, max: 25 },
    sourcesReadAndCited: { min: 4, max: 8 },
  },
  standard_academic: {
    requestType: "standard_academic",
    label: "Standard academic question",
    candidatesRetrieved: { min: 30, max: 60 },
    sourcesReadAndCited: { min: 8, max: 20 },
  },
  literature_review: {
    requestType: "literature_review",
    label: "Literature review or comparison",
    candidatesRetrieved: { min: 60, max: 120 },
    sourcesReadAndCited: { min: 15, max: 35 },
  },
  deep_research: {
    requestType: "deep_research",
    label: "Deep Research",
    candidatesRetrieved: { min: 100, max: 300 },
    sourcesReadAndCited: { min: 30, max: 80 },
  },
};

export interface ResolvedSourceBudget {
  requestType: AskScholarRequestType;
  label: string;
  targetCandidates: number;
  minCandidates: number;
  maxCandidates: number;
  targetCited: number;
  minCited: number;
  maxCited: number;
}

/**
 * Resolves the concrete source budget for a request type and user's answer length preference.
 */
export function resolveSourceBudget(
  requestType: AskScholarRequestType,
  lengthPreference: AnswerLengthPreference = "standard"
): ResolvedSourceBudget {
  const cfg = SOURCE_BUDGET_CONFIG[requestType] || SOURCE_BUDGET_CONFIG.standard_academic;
  const factor =
    lengthPreference === "concise"
      ? 0.0
      : lengthPreference === "detailed"
        ? 1.0
        : 0.5;

  const targetCandidates = Math.round(
    cfg.candidatesRetrieved.min +
      (cfg.candidatesRetrieved.max - cfg.candidatesRetrieved.min) * factor
  );
  const targetCited = Math.round(
    cfg.sourcesReadAndCited.min +
      (cfg.sourcesReadAndCited.max - cfg.sourcesReadAndCited.min) * factor
  );

  return {
    requestType: cfg.requestType,
    label: cfg.label,
    targetCandidates,
    minCandidates: cfg.candidatesRetrieved.min,
    maxCandidates: cfg.candidatesRetrieved.max,
    targetCited,
    minCited: cfg.sourcesReadAndCited.min,
    maxCited: cfg.sourcesReadAndCited.max,
  };
}

export interface DisciplineProfile {
  id: AskScholarDisciplineId;
  label: string;
  preferredSourceTypes: string[];
  preferredProviders: ScholarlyProviderId[];
  evidenceStandards: string;
  queryExpansionTerms: string[];
}

/**
 * Discipline Configuration Profiles (Section 7).
 */
export const DISCIPLINE_PROFILES: Record<AskScholarDisciplineId, DisciplineProfile> = {
  stem: {
    id: "stem",
    label: "STEM (Science, Technology, Engineering & Mathematics)",
    preferredSourceTypes: [
      "peer-reviewed article",
      "conference paper",
      "technical standard",
      "preprint",
    ],
    preferredProviders: [
      "openalex",
      "crossref",
      "semantic_scholar",
      "arxiv",
      "core",
      "doaj",
    ],
    evidenceStandards:
      "Prioritize peer-reviewed empirical studies, reproducible benchmarks, formal proofs, and IEEE/ACM/Nature/Science proceedings. Label preprints explicitly as not peer-reviewed.",
    queryExpansionTerms: ["empirical evaluation", "benchmark", "methodology", "experimental results"],
  },
  management_business: {
    id: "management_business",
    label: "Management & Business",
    preferredSourceTypes: [
      "peer-reviewed article",
      "case study",
      "practitioner journal",
      "institutional report",
      "working paper",
    ],
    preferredProviders: [
      "openalex",
      "crossref",
      "ssrn",
      "repec",
      "semantic_scholar",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize empirical management studies (Academy of Management, Strategic Management Journal), longitudinal organizational case studies, NBER/SSRN/RePEc working papers, and central bank or regulatory data.",
    queryExpansionTerms: ["organizational performance", "empirical analysis", "case study", "strategic management"],
  },
  social_sciences: {
    id: "social_sciences",
    label: "Social Sciences (Economics, Sociology, Political Science, Psychology)",
    preferredSourceTypes: [
      "peer-reviewed article",
      "government report",
      "institutional report",
      "working paper",
      "book chapter",
    ],
    preferredProviders: [
      "openalex",
      "crossref",
      "semantic_scholar",
      "ssrn",
      "repec",
      "doaj",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize quasi-experimental and longitudinal cohort designs, national statistical agencies, multilateral institutional data (UN, World Bank, OECD), and peer-reviewed journals.",
    queryExpansionTerms: ["empirical evidence", "longitudinal study", "policy impact", "panel data"],
  },
  humanities: {
    id: "humanities",
    label: "Humanities (History, Philosophy, Literature, Arts)",
    preferredSourceTypes: [
      "academic monograph",
      "primary text",
      "peer-reviewed article",
      "book chapter",
      "archival record",
    ],
    preferredProviders: [
      "openalex",
      "crossref",
      "core",
      "doaj",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize university press monographs, primary historical and literary texts, critical editions, and historiography.",
    queryExpansionTerms: ["historiography", "critical analysis", "primary sources", "monograph"],
  },
  health: {
    id: "health",
    label: "Health, Medicine & Life Sciences",
    preferredSourceTypes: [
      "systematic review",
      "clinical guideline",
      "randomized controlled trial",
      "peer-reviewed article",
      "government report",
    ],
    preferredProviders: [
      "pubmed_europe_pmc",
      "openalex",
      "crossref",
      "semantic_scholar",
      "doaj",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize Cochrane systematic reviews, meta-analyses, randomized controlled trials (RCTs), and official clinical guidelines (WHO, CDC, NICE, NIH). Verify retraction status rigorously.",
    queryExpansionTerms: ["systematic review", "meta-analysis", "randomized controlled trial", "clinical guideline"],
  },
  law: {
    id: "law",
    label: "Law, Regulation & Governance",
    preferredSourceTypes: [
      "primary legal source",
      "statute or treaty",
      "law review article",
      "government report",
      "regulatory guidance",
    ],
    preferredProviders: [
      "openalex",
      "crossref",
      "ssrn",
      "doaj",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize primary legal texts, statutes, treaties, judicial opinions, official regulatory decisions, and peer-reviewed or flagship law review articles.",
    queryExpansionTerms: ["jurisprudence", "statutory framework", "legal analysis", "regulatory compliance"],
  },
  education: {
    id: "education",
    label: "Education & Pedagogy",
    preferredSourceTypes: [
      "peer-reviewed article",
      "systematic review",
      "institutional report",
      "government report",
    ],
    preferredProviders: [
      "eric",
      "openalex",
      "crossref",
      "semantic_scholar",
      "doaj",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize ERIC-indexed educational research, classroom intervention studies, longitudinal student outcome evaluations, and UNESCO/Department of Education reports.",
    queryExpansionTerms: ["educational outcomes", "pedagogical intervention", "empirical study", "curriculum evaluation"],
  },
  general: {
    id: "general",
    label: "Interdisciplinary & General Academic",
    preferredSourceTypes: [
      "peer-reviewed article",
      "systematic review",
      "government report",
      "institutional report",
      "academic book",
    ],
    preferredProviders: [
      "openalex",
      "crossref",
      "semantic_scholar",
      "pubmed_europe_pmc",
      "core",
      "doaj",
      "authoritative_web",
    ],
    evidenceStandards:
      "Prioritize peer-reviewed scholarly journals, academic books, government statistics, and established institutional reports.",
    queryExpansionTerms: ["empirical study", "systematic analysis", "peer-reviewed", "institutional report"],
  },
};

export interface PromptClassification {
  discipline: AskScholarDisciplineId;
  disciplineProfile: DisciplineProfile;
  questionType: AskScholarQuestionType;
  requestType: AskScholarRequestType;
  requiresRetrieval: boolean;
  sourceBudget: ResolvedSourceBudget;
}

/**
 * Classifies a prompt's discipline, question type, and complexity to choose the source budget
 * and decide whether evidence retrieval is needed (Sections 2, 3, 4).
 */
export function classifyResearchPrompt(
  prompt: string,
  optionsOrIsDeep:
    | boolean
    | "chat"
    | "deep_research"
    | {
        isDeepResearch?: boolean;
        preferredDiscipline?: AskScholarDisciplineId | "auto";
        lengthPreference?: AnswerLengthPreference;
      } = {}
): PromptClassification {
  const options =
    typeof optionsOrIsDeep === "boolean"
      ? { isDeepResearch: optionsOrIsDeep }
      : typeof optionsOrIsDeep === "string"
        ? { isDeepResearch: optionsOrIsDeep === "deep_research" }
        : optionsOrIsDeep;
  const clean = (prompt || "").trim();
  const lower = clean.toLowerCase();

  // Check if pure greeting/conversational acknowledgement that doesn't require external evidence
  const isPureGreeting =
    /^(?:hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|ok|okay|got it|bye|goodbye)[!.,?\s]*$/i.test(
      clean
    );

  // Detect discipline
  let discipline: AskScholarDisciplineId =
    options.preferredDiscipline && options.preferredDiscipline !== "auto"
      ? options.preferredDiscipline
      : "general";
  if (!options.preferredDiscipline || options.preferredDiscipline === "general" || options.preferredDiscipline === "auto") {
    if (
      /\b(?:clinical|patient|medical|disease|therapy|vaccine|mortality|oncology|cardiology|epidemiology|pharma|hospital|healthcare|cohort|randomized controlled|pubmed|diagnosis|treatment|gene|crispr|neuroscience|pathology)\b/i.test(
        lower
      )
    ) {
      discipline = "health";
    } else if (
      /\b(?:statute|constitutional|jurisprudence|court|treaty|tort|litigation|judicial|legislation|regulation|legal|criminal law|international law|human rights law|antitrust|arbitration)\b/i.test(
        lower
      )
    ) {
      discipline = "law";
    } else if (
      /\b(?:Pedagogy|curriculum|classroom|student achievement|higher education|k-12|literacy|teacher training|educational|schooling|learner)\b/i.test(
        lower
      )
    ) {
      discipline = "education";
    } else if (
      /\b(?:supply chain|corporate governance|firm performance|marketing|entrepreneurship|stakeholder|business model|fintech|merger|acquisition|leadership|organizational|human resource|return on equity|management|strategy)\b/i.test(
        lower
      )
    ) {
      discipline = "management_business";
    } else if (
      /\b(?:algorithm|quantum|neural network|transformer|compiler|thermodynamics|semiconductor|cryptography|machine learning|photovoltaic|polymer|genome|astrophysics|mathematics|topology|calculus|engineering|robotics|battery|catalyst)\b/i.test(
        lower
      )
    ) {
      discipline = "stem";
    } else if (
      /\b(?:historiography|medieval|renaissance|postcolonial|literary|poetics|epistemology|metaphysics|ethics|aesthetics|monograph|archival|classical|philosophy|shakespeare|antiquity)\b/i.test(
        lower
      )
    ) {
      discipline = "humanities";
    } else if (
      /\b(?:gdp|inflation|monetary policy|fiscal|democratization|geopolitics|electoral|sociology|inequality|migration|demography|macroeconomic|microeconomic|governance|diplomacy|foreign policy|voter|polarisation|polarization)\b/i.test(
        lower
      )
    ) {
      discipline = "social_sciences";
    }
  }

  // Detect Question Type
  let questionType: AskScholarQuestionType = "empirical";
  if (
    /\b(?:literature review|systematic review|meta-analysis|state of the art|survey of|synthesize the literature|overview of research)\b/i.test(
      lower
    )
  ) {
    questionType = "review";
  } else if (
    /\b(?:compare|contrast|versus|vs\.?|difference between|comparison of|trade-offs between)\b/i.test(
      lower
    )
  ) {
    questionType = "comparative";
  } else if (
    /\b(?:methodology|research design|econometric|how to measure|statistical method|sampling strategy|experimental design|identification strategy)\b/i.test(
      lower
    )
  ) {
    questionType = "methods";
  } else if (
    /\b(?:theoretical framework|theory of|conceptual model|epistemological|paradigm|ontology|philosophical)\b/i.test(
      lower
    )
  ) {
    questionType = "theoretical";
  } else if (
    /\b(?:policy|regulation|regulatory|guideline|governance|intervention|public policy|reform)\b/i.test(
      lower
    )
  ) {
    questionType = "policy";
  } else if (
    clean.split(/\s+/).length <= 8 &&
    /^(?:what is|who is|when was|where is|define|what Year)\b/i.test(lower)
  ) {
    questionType = "simple_factual";
  }

  // Determine Request Type for Source Budget (Section 3)
  let requestType: AskScholarRequestType = "standard_academic";
  if (options.isDeepResearch || /\b(?:deep research|exhaustive report|comprehensive literature review)\b/i.test(lower)) {
    requestType = "deep_research";
  } else if (
    questionType === "review" ||
    questionType === "comparative" ||
    /\b(?:literature review|compare|meta-analysis|systematic review|critically evaluate|comprehensive analysis)\b/i.test(lower) ||
    clean.split(/\s+/).length >= 30
  ) {
    requestType = "literature_review";
  } else if (questionType === "simple_factual") {
    requestType = "simple_factual";
  }

  const sourceBudget = resolveSourceBudget(requestType, options.lengthPreference || "standard");
  const disciplineProfile = DISCIPLINE_PROFILES[discipline] || DISCIPLINE_PROFILES.general;

  return {
    discipline,
    disciplineProfile,
    questionType,
    requestType,
    requiresRetrieval: !isPureGreeting && clean.length >= 3,
    sourceBudget,
  };
}

/**
 * Generates multiple query variations per question (synonyms, discipline terms, sub-questions)
 * so retrieval never relies on a single query to a single provider (Section 3 & 4).
 */
export function generateQueryVariations(
  query: string,
  classification: PromptClassification
): string[] {
  const base = query
    .replace(/^(?:please|can you|could you|tell me about|explain|analyze|describe|discuss)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();

  if (!base) return [];

  const variations: string[] = [base];

  // 1. Core conceptual keywords extraction
  const stop = new Set([
    "what", "how", "why", "when", "where", "which", "who", "whom",
    "does", "do", "did", "is", "are", "was", "were", "the", "and",
    "for", "with", "from", "into", "between", "among", "about", "that", "this",
  ]);
  const tokens = base
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9-]/g, ""))
    .filter((t) => t.length >= 3 && !stop.has(t.toLowerCase()));

  if (tokens.length >= 2) {
    const coreKeywords = tokens.slice(0, 7).join(" ");
    if (coreKeywords.toLowerCase() !== base.toLowerCase()) {
      variations.push(coreKeywords);
    }
  }

  // 2. Discipline-specific methodological variation
  const expTerms = classification.disciplineProfile.queryExpansionTerms;
  if (expTerms.length > 0 && tokens.length >= 2) {
    const topKeywords = tokens.slice(0, 5).join(" ");
    variations.push(`${topKeywords} ${expTerms[0]}`);
    if (
      (classification.requestType === "literature_review" ||
        classification.requestType === "deep_research") &&
      expTerms.length > 1
    ) {
      variations.push(`${topKeywords} ${expTerms[1]}`);
    }
  }

  // 3. Review / empirical evidence variation
  if (classification.requestType !== "simple_factual" && tokens.length >= 2) {
    const topKeywords = tokens.slice(0, 5).join(" ");
    variations.push(`${topKeywords} empirical study review`);
  }

  return Array.from(new Set(variations));
}

/**
 * User Settings Storage Helper (Section 15).
 */
export interface AskScholarUserSettings {
  preferredCitationStyle: "apa" | "mla" | "chicago" | "chicago-notes" | "harvard" | "ieee" | "vancouver";
  preferredDiscipline: AcademicDiscipline;
  answerLengthPreference: AnswerLengthPreference;
}

const SETTINGS_STORAGE_KEY = "scholar_ask_user_settings_v1";

export const DEFAULT_ASK_SCHOLAR_SETTINGS: AskScholarUserSettings = {
  preferredCitationStyle: "apa",
  preferredDiscipline: "general",
  answerLengthPreference: "standard",
};

export function loadAskScholarSettings(): AskScholarUserSettings {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AskScholarUserSettings>;
        return {
          preferredCitationStyle: parsed.preferredCitationStyle || DEFAULT_ASK_SCHOLAR_SETTINGS.preferredCitationStyle,
          preferredDiscipline: parsed.preferredDiscipline || DEFAULT_ASK_SCHOLAR_SETTINGS.preferredDiscipline,
          answerLengthPreference: parsed.answerLengthPreference || DEFAULT_ASK_SCHOLAR_SETTINGS.answerLengthPreference,
        };
      }
    }
  } catch {
    // Fall back to defaults
  }
  return { ...DEFAULT_ASK_SCHOLAR_SETTINGS };
}

export function saveAskScholarSettings(updates: Partial<AskScholarUserSettings>): AskScholarUserSettings {
  const next: AskScholarUserSettings = { ...loadAskScholarSettings(), ...updates };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage errors: the in-memory value is still returned
  }
  return next;
}
