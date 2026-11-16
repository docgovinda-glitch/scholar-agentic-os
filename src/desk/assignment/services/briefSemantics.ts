import { clipHeadingWords, isNonQuestionBriefLine } from "../../../utils/briefQuestions";
import { stripSlideArtifacts, extractSubstantiveBriefQuestions, isClassroomLogisticsLine } from "../../../utils/briefExtractor";
import type { AcademicLevel } from "../types";

export interface DeconstructedQuestion {
  raw: string;
  cleanedQuestion: string;
  subjectA: string;
  subjectB?: string;
  relationType: "role_in" | "impact_on" | "comparative" | "evaluative" | "development_over_time" | "exploratory";
  subjectFormattedA: string;
  subjectFormattedB?: string;
  topicA: string;
  topicB: string;
}
/**
 * Linguistically deconstruct an assignment question into semantic components
 * to generate tightly tailored headings, subheadings, and thesis statements.
 */

export function deconstructQuestionSemantics(question: string): DeconstructedQuestion {
  const qStr = (typeof question === "string" ? question : String(question || "")).slice(0, 2000);
  const cleanPrompt = qStr
    .replace(/^(critically\s+)?(examine|evaluate|assess|analyze|analyse|discuss|investigate|explore|to\s+what\s+extent\s+does|what\s+is\s+the\s+role\s+of|the\s+role\s+of|an\s+analysis\s+of|how\s+does|in\s+what\s+ways\s+does)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();

  // Pattern 1: Role of A in / within B
  // e.g. "Role of AI in machine learning" -> A = "AI", B = "machine learning"
  const roleMatch = qStr.match(/(?:role|function|place|significance|position)\s+of\s+([^\n.?]+?)\s+(?:in|within)\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (roleMatch) {
    const a = roleMatch[1].trim();
    const b = roleMatch[2].trim();
    const fA = formatAcademicTopicTitle(a);
    const fB = formatAcademicTopicTitle(b);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      subjectB: b,
      relationType: "role_in",
      subjectFormattedA: fA,
      subjectFormattedB: fB,
      topicA: fA,
      topicB: fB,
    };
  }

  // Pattern 2: Impact / Effect / Influence of A on / upon B
  const impactMatch = qStr.match(/(?:impact|effect|influence|consequence|implications)\s+of\s+([^\n.?]+?)\s+(?:on|upon|across)\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (impactMatch) {
    const a = impactMatch[1].trim();
    const b = impactMatch[2].trim();
    const fA = formatAcademicTopicTitle(a);
    const fB = formatAcademicTopicTitle(b);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      subjectB: b,
      relationType: "impact_on",
      subjectFormattedA: fA,
      subjectFormattedB: fB,
      topicA: fA,
      topicB: fB,
    };
  }

  // Pattern 3: Comparing / Contrast / Versus
  const vsMatch = qStr.match(/(?:compare|contrast|distinction\s+between|relationship\s+between|interplay\s+between|nexus\s+between)\s+([^\n.?]+?)\s+(?:and|with|versus|vs\.?)\s+([^\n.?]+?)(?:\.|\?|$)/i) ||
    (/\b(?:versus|vs\.?)\b/i.test(qStr) ? qStr.match(/^([^\n.?]+?)\s+(?:versus|vs\.?)\s+([^\n.?]+?)(?:\.|\?|$)/i) : null);
  if (vsMatch) {
    const a = vsMatch[1].replace(/^(?:the\s+)/i, "").trim();
    const b = vsMatch[2].trim();
    const fA = formatAcademicTopicTitle(a);
    const fB = formatAcademicTopicTitle(b);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      subjectB: b,
      relationType: "comparative",
      subjectFormattedA: fA,
      subjectFormattedB: fB,
      topicA: fA,
      topicB: fB,
    };
  }

  // Pattern 4: Evaluative / "To what extent..."
  const evalMatch = qStr.match(/(?:evaluate|assess|appraise|effectiveness\s+of|success\s+of|limitations\s+of)\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (evalMatch) {
    const a = evalMatch[1].trim();
    const fA = formatAcademicTopicTitle(a);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      relationType: "evaluative",
      subjectFormattedA: fA,
      topicA: fA,
      topicB: "",
    };
  }

  // Pattern 5: Evolution / Development of X
  const evolMatch = qStr.match(/(?:evolution|development|history|future|emergence)\s+of\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (evolMatch) {
    const a = evolMatch[1].trim();
    const fA = formatAcademicTopicTitle(a);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      relationType: "development_over_time",
      subjectFormattedA: fA,
      topicA: fA,
      topicB: "",
    };
  }

  // Fallback: extract nominal groups
  const words = cleanPrompt.split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from|that|this|these|those|into|about)$/i.test(w));
  const subjectA = words.slice(0, 4).join(" ") || cleanPrompt || "Core Analytical Subject";
  const subjectB = words.length > 4 ? words.slice(4, 8).join(" ") : undefined;
  const fA = formatAcademicTopicTitle(subjectA);
  const fB = subjectB ? formatAcademicTopicTitle(subjectB) : "";

  return {
    raw: qStr,
    cleanedQuestion: cleanPrompt,
    subjectA,
    subjectB,
    relationType: "exploratory",
    subjectFormattedA: fA,
    subjectFormattedB: subjectB ? fB : undefined,
    topicA: fA,
    topicB: fB,
  };
}
export interface ExtractedBriefInquiries {
  subQuestions: string[];
  keyConcepts: string[];
  extractedTasks: string[];
  coreThemes: string[];
}
/**
 * Extract key research inquiries, sub-questions, and domain terminology from the assignment brief.
 */

export function extractBriefInquiriesAndConcepts(
  question: string,
  briefText?: string
): ExtractedBriefInquiries {
  const combined = `${question}\n\n${briefText || ""}`.trim().slice(0, 15000);
  const cleanCombined = stripSlideArtifacts(combined);
  const lines = cleanCombined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const subQuestions: string[] = [];
  const extractedTasks: string[] = [];
  const keyConcepts: string[] = [];
  const seenItems = new Set<string>();

  // Extract substantive questions directly if available
  const substantiveQuestions = extractSubstantiveBriefQuestions(cleanCombined);
  for (const sq of substantiveQuestions) {
    if (!isNonQuestionBriefLine(sq) && !seenItems.has(sq.toLowerCase())) {
      seenItems.add(sq.toLowerCase());
      subQuestions.push(sq);
    }
  }

  // 1. Identify explicitly numbered/bulleted directives, tasks, or sub-questions
  const taskNumberRegex = /^(?:(?:\d+|[a-zA-Z])[\.\):\-]|part\s*[\da-zA-Z]+[:\-\s]|task\s*[\da-zA-Z]+[:\-\s]|question\s*[\da-zA-Z]+[:\-\s])\s*(.+)/i;
  const bulletRegex = /^[-*•]\s*(.+)/;

  let inTaskBlock = false;
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || isClassroomLogisticsLine(cleanLine) || isNonQuestionBriefLine(cleanLine)) continue;

    // Detect directive trigger headers
    if (/(?:in your answer|address the following|ensure you address|tasks?|questions?|sub-questions?|key requirements?|topics? to cover)[:]/i.test(cleanLine)) {
      inTaskBlock = true;
      continue;
    }

    const taskMatch = cleanLine.match(taskNumberRegex);
    if (taskMatch) {
      const text = taskMatch[1].replace(/[?.!]+$/, "").trim();
      if (text.length >= 8 &&
        !isClassroomLogisticsLine(text) &&
        !seenItems.has(text.toLowerCase()) &&
        !/^\d+%\s*[-–]\s*\d+%/.test(text)) {
        seenItems.add(text.toLowerCase());
        extractedTasks.push(text);
      }
      continue;
    }

    if (inTaskBlock && bulletRegex.test(cleanLine)) {
      const text = cleanLine.replace(bulletRegex, "$1").replace(/[?.!]+$/, "").trim();
      if (text.length >= 8 && !isClassroomLogisticsLine(text) && !seenItems.has(text.toLowerCase())) {
        seenItems.add(text.toLowerCase());
        extractedTasks.push(text);
      }
      continue;
    }

    // Sentence question ending in ?
    if (cleanLine.endsWith("?") && cleanLine.length >= 15 && !cleanLine.toLowerCase().includes("pay people to leave")) {
      const text = cleanLine.replace(/\?+$/, "").trim();
      if (!isClassroomLogisticsLine(text) && !seenItems.has(text.toLowerCase())) {
        seenItems.add(text.toLowerCase());
        subQuestions.push(text);
      }
    }
  }

  // 2. Extract technical terms, acronyms, and proper noun clusters
  const phraseRegex = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[A-Z]{2,}(?:-[A-Z0-9]+)?)\b/g;
  const matches = combined.match(phraseRegex) || [];
  const stopTerms = new Set([
    "assignment brief", "module handbook", "target word", "word count", "academic year",
    "marking rubric", "course details", "assessment criteria", "first class", "upper second",
    "scholar os", "student id", "due date", "united kingdom", "united states", "course code",
    "executive summary", "table of contents", "learning outcomes", "reference list", "grading scale"
  ]);

  for (const m of matches) {
    const clean = m.trim();
    if (clean.length > 2 && !stopTerms.has(clean.toLowerCase()) && !keyConcepts.includes(clean)) {
      keyConcepts.push(clean);
    }
  }

  // 3. Extract core thematic nouns from question/brief
  const coreThemes: string[] = [];
  const words = question
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(this|that|with|from|have|been|which|their|about|what|when|where|examine|evaluate|assess|analyze|analyse|critically|discuss|investigate|explore)$/i.test(w));
  for (let i = 0; i < words.length - 1; i += 2) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (!coreThemes.includes(pair)) {
      coreThemes.push(formatAcademicTopicTitle(pair));
    }
  }

  return {
    subQuestions,
    keyConcepts: keyConcepts.slice(0, 10),
    extractedTasks,
    coreThemes: coreThemes.slice(0, 10),
  };
}
/**
 * Generate a dynamic, tone-calibrated academic thesis statement or central problem formulation.
 */
/** Known academic acronyms to preserve in uppercase */
export const ACADEMIC_ACRONYMS = new Set([
  "AI", "ML", "DL", "NLP", "LLM", "LLMS", "CNN", "CNNS", "RNN", "RNNS",
  "SVM", "SVMS", "RL", "RLHF", "GAN", "GANS", "API", "APIS", "UI", "UX",
  "EU", "UN", "US", "UK", "WTO", "IMF", "WHO", "NATO", "ASEAN", "BRICS",
  "GDP", "FDI", "ESG", "CSR", "HRM", "KPI", "KPIS", "ROI",
  "DNA", "RNA", "CRISPR", "CAR-T", "MHC", "FDA", "EMA", "NHS",
  "BQP", "QEC", "NISQ", "BB84", "FIPS", "IPE", "IR", "BRI",
  "CBAM", "GATT", "OECD", "SWIFT", "CBDC", "D2C", "ERM", "ZNE", "PEC", "CDR",
  "ICANS", "CRS", "RBV", "VRIO", "PESTLE", "SWOT", "IMRAD", "SSPS", "IPCC",
  "NDC", "NDCS", "FHIR", "HL7", "HIPAA", "SAMD", "EV", "EVS"
]);
/** True for tokens whose casing carries meaning and must be kept as written. */

export function keepsOwnCasing(token: string): boolean {
  const core = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!core) return true;
  if (/\p{Lu}.*\p{Lu}/u.test(core)) return true; // QKD, NP-complete, ML-KEM, RSA-2048, McKinsey
  if (/\d/.test(core)) return true; // RSA-2048, 15, 2018
  if (/^\p{Ll}+\p{Lu}/u.test(core)) return true; // mK, eV, iOS
  if (/^\(/.test(token)) return true; // parenthetical citations "(Preskill, 2018)"
  return false;
}
/** Format an extracted phrase into clean, academic title case while respecting acronyms */

export function formatAcademicTopicTitle(raw: string): string {
  if (!raw) return "";
  const cleaned = raw
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[?.!]+$/, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const formatted = words.map((w, idx) => {
    const cleanWord = w.replace(/^[^\w]+|[^\w]+$/g, "");
    const upper = cleanWord.toUpperCase();
    if (ACADEMIC_ACRONYMS.has(upper)) {
      return w.replace(new RegExp(cleanWord, "i"), upper);
    }
    // Lowercase small grammatical prepositions/conjunctions unless first word
    if (idx > 0 &&
      /^(a|an|and|as|at|but|by|for|if|in|nor|of|on|or|so|the|to|up|yet|with|within|versus|vs|via)$/i.test(cleanWord)) {
      return w.toLowerCase();
    }
    // Never rewrite what is already deliberately cased: acronyms (QKD, RSA-2048,
    // NP-complete, ML-KEM), units (mK), names in citations (Preskill), mixed case.
    if (keepsOwnCasing(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return formatted.join(" ");
}
/** A short (about 8 word) heading from a question: drops the leading command verb. */

export function shortHeading(text: string, maxWords = 8): string {
  const stripped = text
    .replace(/^(?:critically\s+)?(?:compare|contrast|evaluate|analy[sz]e|assess|discuss|explain|describe|examine|derive|justify|propose|recommend|explore|investigate|identify|outline|define|apply|develop|design|calculate|show)\s+(?:and\s+\w+\s+)?/i, "")
    .replace(/[?.:]+$/, "")
    .trim();
  const cut = clipHeadingWords(stripped, maxWords);
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}
/** Keep a title as written (no case changes) but at most `maxWords` words. */
export function clipWords(text: string, maxWords: number): string {
  return clipHeadingWords(text.replace(/[:.\s]+$/, "").trim(), maxWords);
}
// NOTE (Single-Brain Architecture): target theoretical frameworks are never
// derived here from keyword tables. They come only from scholarBrain-driven AI
// output (`target_frameworks`) or from the user's own edits.
/** Check if a heading title is a generic banned placeholder */

export function isGenericPlaceholderTitle(title: string): boolean {
  if (!title || typeof title !== "string") return true;
  const t = title.trim().toLowerCase().replace(/^[\d.]+\s*/, "").trim();
  const bannedPatterns = [
    /^introduction$/i,
    /^body$/i,
    /^body\s*paragraph(?:\s*\d+)?$/i,
    /^body\s*section(?:\s*\d+)?$/i,
    /^section(?:\s*\d+)?$/i,
    /^main\s*argument(?:\s*\d+)?$/i,
    /^analysis$/i,
    /^discussion$/i,
    /^conclusion$/i,
    /^overview$/i,
    /^background$/i,
    /^summary$/i,
    /^findings$/i,
    /^literature\s*review$/i,
    /^methodology$/i,
  ];
  return bannedPatterns.some((pattern) => pattern.test(t));
}
/**
 * Generate a dynamic, tone-calibrated academic thesis statement or central problem formulation.
 * Tailors claims specifically to the assignment question and academic tone.
 */

export function generateThesisStatement(
  question: string,
  tone?: string,
  academicLevel?: AcademicLevel
): string {
  const qStr = typeof question === "string" ? question : String(question || "");
  const rawTone = typeof tone === "string" ? tone : (tone as unknown as { preset?: string; id?: string } | undefined)?.preset || (tone as unknown as { preset?: string; id?: string } | undefined)?.id || "formal_academic";
  const toneLower = String(rawTone || "formal_academic").toLowerCase();

  // The thesis is phrased from the question itself; there are no subject-specific canned theses.
  const deconstructed = deconstructQuestionSemantics(qStr);
  const topicA = deconstructed.subjectFormattedA;
  const topicB = deconstructed.subjectFormattedB;

  if (deconstructed.relationType === "role_in" && topicB) {
    if (toneLower.includes("persuasive") || toneLower.includes("argumentative")) {
      return `This paper contends that ${topicA} serves as the decisive operational catalyst within ${topicB}, establishing that its structural integration is essential to achieving sustainable efficacy.`;
    }
    if (toneLower.includes("critical")) {
      return `This critique problematizes the presumed efficacy of ${topicA} within ${topicB}, demonstrating that underlying structural constraints and institutional frictions fundamentally limit its practical impact.`;
    }
    return `This study investigates the integral role of ${topicA} within ${topicB}, systematically evaluating the theoretical mechanisms, operational dynamics, and empirical outcomes that govern their interaction.`;
  }

  if (deconstructed.relationType === "impact_on" && topicB) {
    if (toneLower.includes("persuasive") || toneLower.includes("argumentative")) {
      return `This paper argues that the impact of ${topicA} on ${topicB} produces profound systemic transformation, necessitating a fundamental recalibration of existing strategic and theoretical paradigms.`;
    }
    if (toneLower.includes("critical")) {
      return `This critique challenges optimistic accounts regarding the influence of ${topicA} on ${topicB}, highlighting systemic disparities, unintended externalities, and empirical inconsistencies across contemporary environments.`;
    }
    return `This analysis examines the multi-faceted impact of ${topicA} on ${topicB}, analyzing direct empirical evidence, mediating variables, and broader disciplinary implications.`;
  }

  if (deconstructed.relationType === "comparative" && topicB) {
    if (toneLower.includes("critical")) {
      return `This comparative critique interrogates the core dichotomy between ${topicA} and ${topicB}, demonstrating that rigid paradigmatic divisions obscure shared structural vulnerabilities and implementation constraints.`;
    }
    return `This comparative study evaluates the contrasting theoretical foundations, operational trade-offs, and empirical efficacy of ${topicA} versus ${topicB} across contemporary practice.`;
  }

  // General Tone-Calibrated Fallbacks
  const topicText = topicB ? `${topicA} in relation to ${topicB}` : topicA;
  if (toneLower.includes("persuasive") || toneLower.includes("argumentative")) {
    return `This investigation argues that an evidence-based analysis of ${topicText} demonstrates decisive systemic advantages, challenging conventional assumptions and substantiating a revised analytical paradigm.`;
  }
  if (toneLower.includes("critical")) {
    return `This critique problematizes prevailing assumptions surrounding ${topicText}, demonstrating how underlying structural inequalities, methodological limitations, and institutional blind spots undermine purported outcomes.`;
  }
  return `This study provides a systematic academic investigation into ${topicText}, synthesizing authoritative theoretical frameworks and empirical evidence to evaluate contemporary outcomes.`;
}

/**
 * The research sub-questions the brief itself asks (its questions and tasks).
 * Empty when the brief states none: no generic questions are made up.
 */
export function briefSubQuestions(question: string, briefText?: string): string[] {
  const extracted = extractBriefInquiriesAndConcepts(question || "", briefText || "");
  return [...(extracted.subQuestions || []), ...(extracted.extractedTasks || [])].filter((q) => q && q.trim().length > 15);
}
