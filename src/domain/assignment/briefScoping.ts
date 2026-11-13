/**
 * Reads an assignment brief before anything is built: which subject area it
 * belongs to, what kind of task it is, and the level, length, referencing
 * style and marking criteria it states. Only what the text says is taken;
 * anything else stays a default the student can change. When something that
 * shapes the work is missing, at most two quick questions are asked.
 * Pure; no I/O.
 */

export type DisciplineId = "humanities" | "social_sciences" | "stem" | "health" | "business" | "law" | "education";
export type AssignmentTypeId =
  | "essay"
  | "critical_essay"
  | "argumentative_essay"
  | "literature_review"
  | "research_paper"
  | "case_study"
  | "report"
  | "policy_analysis"
  | "business_assignment";
export type LevelId = "high_school" | "undergraduate" | "postgraduate" | "doctoral";
export type CitationId = "apa7" | "mla9" | "chicago" | "harvard" | "ieee" | "vancouver";

export interface Discipline {
  id: DisciplineId;
  label: string;
  /** How the breakdown and outline are shaped for this subject. */
  lens: string;
  /** One line shown to the student. */
  approach: string;
}

export const DISCIPLINES: Discipline[] = [
  {
    id: "humanities",
    label: "Humanities (history, literature, philosophy, arts)",
    approach: "a thematic argument built on close reading of sources",
    lens: "Organise by themes or lines of argument, not by method. Each section advances an interpretation, works closely with primary texts or sources, weighs competing readings, and builds to a defended position.",
  },
  {
    id: "social_sciences",
    label: "Social sciences (politics, sociology, psychology, IR)",
    approach: "concepts and theory tested against evidence and cases",
    lens: "Define the key concepts, set out the theoretical lens, then examine evidence or cases against it, consider rival explanations, and conclude on the question asked.",
  },
  {
    id: "stem",
    label: "Science, technology, engineering or maths",
    approach: "a problem, hypothesis or design, its method, results and evaluation",
    lens: "Follow the logic of the problem: background and aim or hypothesis, method or design, results or analysis, then evaluation of limitations and conclusions. Prefer precise, testable claims over rhetoric.",
  },
  {
    id: "health",
    label: "Health, nursing or medicine",
    approach: "evidence-based practice: the clinical question, the evidence, its appraisal and the implications",
    lens: "Frame the clinical or practice question (e.g. population, intervention, comparison, outcome), appraise the quality of the evidence, apply it to practice, and note ethical and patient-safety considerations.",
  },
  {
    id: "business",
    label: "Business, management or economics",
    approach: "a case framework: the situation, analysis with suitable models, options and recommendations",
    lens: "Set out the situation or case, analyse it with frameworks that fit the question (only those that fit), compare options, and finish with justified, actionable recommendations and their risks.",
  },
  {
    id: "law",
    label: "Law",
    approach: "issues, the rules that govern them, their application, and a conclusion",
    lens: "Identify each legal issue, state the governing rules and authorities, apply them to the facts or question, address counter-arguments, and conclude on each issue.",
  },
  {
    id: "education",
    label: "Education or reflective practice",
    approach: "theory linked to practice, with reflection on what changes",
    lens: "Link theory to practice: describe the context, analyse it with relevant educational theory, reflect critically on what happened and why, and set out what will change.",
  },
];

const DISCIPLINE_WORDS: Array<[DisciplineId, RegExp]> = [
  ["law", /\b(law|legal|statute|tort|contract law|case law|jurisprudence|constitutional|criminal law|plaintiff|defendant|legislation)\b/i],
  ["health", /\b(nursing|clinical|patient|healthcare|health care|medicine|medical|public health|midwifery|pharmac\w+|epidemiolog\w+|NHS|care plan)\b/i],
  ["business", /\b(business|management|marketing|strategy|strategic|finance|accounting|economics?|firm|company|organisation|organization|SWOT|PESTLE|stakeholders?|supply chain|entrepreneur\w*)\b/i],
  ["stem", /\b(experiment|hypothesis|engineering|algorithm|physics|chemistry|biology|mathematic\w*|computer science|software|data set|dataset|laboratory|lab report|quantum|statistical model|simulation)\b/i],
  ["education", /\b(teaching|pedagog\w+|classroom|curriculum|learners?|reflective (practice|account)|placement|lesson plan)\b/i],
  ["humanities", /\b(history|historical|literature|novel|poem|poetry|philosoph\w+|ethics|theolog\w+|art history|film|music|text|author's|renaissance|medieval)\b/i],
  ["social_sciences", /\b(politic\w*|policy|sociolog\w+|psycholog\w+|international relations|governance|democracy|society|social|gender|migration|geopolitic\w*|anthropolog\w+)\b/i],
];

const TYPE_WORDS: Array<[AssignmentTypeId, RegExp]> = [
  ["literature_review", /\bliterature review\b|\bsystematic review\b|\breview (of )?the literature\b/i],
  ["case_study", /\bcase stud(y|ies)\b/i],
  ["policy_analysis", /\bpolicy (brief|analysis|paper|memo)\b/i],
  ["report", /\b(report|lab report|technical report|business report)\b/i],
  ["research_paper", /\bresearch (paper|proposal|project)\b|\bdissertation\b/i],
  ["argumentative_essay", /\b(argue|argumentative|persuade|to what extent do you agree|do you agree)\b/i],
  ["critical_essay", /\b(critically (evaluate|assess|analy[sz]e|discuss|examine)|critique)\b/i],
  ["essay", /\bessay\b|\bdiscuss\b|\bevaluate\b|\bexplain\b|\bcompare\b/i],
];

const LEVEL_WORDS: Array<[LevelId, RegExp]> = [
  ["doctoral", /\b(phd|doctoral|doctorate|dphil)\b/i],
  ["postgraduate", /\b(postgraduate|masters?|msc|m\.sc|ma|mba|mres|llm|level 7)\b/i],
  ["undergraduate", /\b(undergraduate|bachelor'?s?|bsc|b\.sc|ba \(hons\)|year [123]|first[- ]year|second[- ]year|final[- ]year|level [456])\b/i],
  ["high_school", /\b(high school|a[- ]level|gcse|ib diploma|grade 1[0-2]|secondary school)\b/i],
];

const CITATION_WORDS: Array<[CitationId, RegExp]> = [
  ["apa7", /\bAPA\b/],
  ["harvard", /\bHarvard\b/i],
  ["mla9", /\bMLA\b/],
  ["chicago", /\bChicago\b/i],
  ["ieee", /\bIEEE\b/],
  ["vancouver", /\bVancouver\b/i],
];

export interface BriefScope {
  discipline?: DisciplineId;
  assignmentType?: AssignmentTypeId;
  level?: LevelId;
  wordCount?: number;
  citationStyle?: CitationId;
  /** The brief includes marking criteria or a rubric. */
  hasRubric: boolean;
  /** The words in the brief each finding rests on, to show the student. */
  evidence: Partial<Record<"discipline" | "assignmentType" | "level" | "wordCount" | "citationStyle" | "rubric", string>>;
}

function firstMatch<T extends string>(text: string, table: Array<[T, RegExp]>): { id: T; words: string } | undefined {
  for (const [id, re] of table) {
    const m = text.match(re);
    if (m) return { id, words: m[0] };
  }
  return undefined;
}

/** The subject area with the most distinct signal words, if any clearly leads. */
function detectDiscipline(text: string): { id: DisciplineId; words: string } | undefined {
  let best: { id: DisciplineId; words: string; n: number } | undefined;
  for (const [id, re] of DISCIPLINE_WORDS) {
    const all = text.match(new RegExp(re.source, "gi")) ?? [];
    const distinct = Array.from(new Set(all.map((w) => w.toLowerCase())));
    if (distinct.length && (!best || distinct.length > best.n)) best = { id, words: distinct.slice(0, 3).join(", "), n: distinct.length };
  }
  return best;
}

/** Reads what the brief states. Nothing is filled in that the text does not say. */
export function scopeBrief(text: string): BriefScope {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const scope: BriefScope = { hasRubric: false, evidence: {} };
  if (!t) return scope;

  const d = detectDiscipline(t);
  if (d) {
    scope.discipline = d.id;
    scope.evidence.discipline = d.words;
  }
  const ty = firstMatch(t, TYPE_WORDS);
  if (ty) {
    scope.assignmentType = ty.id;
    scope.evidence.assignmentType = ty.words;
  }
  const lv = firstMatch(t, LEVEL_WORDS);
  if (lv) {
    scope.level = lv.id;
    scope.evidence.level = lv.words;
  }
  const wc = t.replace(/\b[A-Z]{2,5}-\d{3,5}\b/gi, " ").match(/\b(\d{1,2}[,.\s]?\d{3}|\d{3,5})\s*(?:-|–|to)?\s*(?:\d{1,2}[,.\s]?\d{3}|\d{3,5})?\s*words?\b/i);
  if (wc) {
    const n = parseInt(wc[1].replace(/[,.\s]/g, ""), 10);
    if (n >= 100 && n <= 50000) {
      scope.wordCount = n;
      scope.evidence.wordCount = wc[0];
    }
  }
  const cs = firstMatch(t, CITATION_WORDS);
  if (cs) {
    scope.citationStyle = cs.id;
    scope.evidence.citationStyle = cs.words;
  }
  const rb = t.match(/\b(marking (criteria|scheme|rubric)|assessment criteria|grading (rubric|criteria)|rubric|learning outcomes?)\b/i);
  if (rb) {
    scope.hasRubric = true;
    scope.evidence.rubric = rb[0];
  }
  return scope;
}

export interface ScopeQuestion {
  id: "discipline" | "assignmentType" | "level";
  question: string;
  options: Array<{ id: string; label: string }>;
  /** What is assumed if the student skips the question. */
  assume: { id: string; label: string };
}

const TYPE_LABELS: Record<AssignmentTypeId, string> = {
  essay: "Essay",
  critical_essay: "Critical essay",
  argumentative_essay: "Argumentative essay",
  literature_review: "Literature review",
  research_paper: "Research paper or proposal",
  case_study: "Case study",
  report: "Report",
  policy_analysis: "Policy brief or analysis",
  business_assignment: "Business assignment",
};

/**
 * At most two quick questions, only about what the brief leaves open and
 * that changes how the work is shaped: the subject area first, then the kind
 * of task. Level, length and style are assumed and can be changed instead.
 */
export function scopingQuestions(scope: BriefScope, answered: Partial<Record<ScopeQuestion["id"], string>> = {}): ScopeQuestion[] {
  const qs: ScopeQuestion[] = [];
  if (!scope.discipline && !answered.discipline) {
    qs.push({
      id: "discipline",
      question: "Which subject is this for?",
      options: DISCIPLINES.map((d) => ({ id: d.id, label: d.label.split(" (")[0] })),
      assume: { id: "social_sciences", label: "Social sciences" },
    });
  }
  if (!scope.assignmentType && !answered.assignmentType) {
    qs.push({
      id: "assignmentType",
      question: "What kind of piece is it?",
      options: (["essay", "report", "case_study", "literature_review", "research_paper"] as AssignmentTypeId[]).map((id) => ({ id, label: TYPE_LABELS[id] })),
      assume: { id: "essay", label: "Essay" },
    });
  }
  return qs.slice(0, 2);
}

export const disciplineById = (id: string | undefined) => DISCIPLINES.find((d) => d.id === id);

/** The structuring guidance given to the AI that builds the breakdown. */
export function structureLens(disciplineId: string | undefined, assignmentType: string | undefined): string {
  const d = disciplineById(disciplineId);
  const lines: string[] = [];
  if (d) lines.push(`SUBJECT AREA: ${d.label}. ${d.lens}`);
  if (assignmentType === "report" || assignmentType === "business_assignment") lines.push("FORM: a report with clear headings; recommendations where the brief asks for them.");
  if (assignmentType === "case_study") lines.push("FORM: a case study: the case, its analysis, and what follows from it.");
  if (assignmentType === "literature_review") lines.push("FORM: a literature review organised by themes or debates, not by one source after another.");
  if (assignmentType === "policy_analysis") lines.push("FORM: a policy analysis: the problem, options, their trade-offs, and a recommendation.");
  if (!lines.length) return "";
  return `${lines.join("\n")}\nShape the headings this way rather than using a fixed generic template.`;
}
