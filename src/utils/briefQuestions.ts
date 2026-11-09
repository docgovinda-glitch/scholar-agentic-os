/**
 * File-grounded parsing of an assignment brief: its questions with the marks the
 * brief itself states, its marking criteria, prescribed references, and a short
 * plain-English summary. Pure functions, no I/O. Nothing here invents content:
 * every value comes from the brief text.
 */

/** Hyphenated course/module codes such as "QNT-4020". */
const COURSE_CODE = /\b[A-Z]{2,5}-\d{3,5}\b/gi;

export function removeCourseCodes(text: string): string {
  return text.replace(COURSE_CODE, " ");
}

const MARKS_RE = /\[?\(?\s*(\d{1,3})\s*(?:marks?|mks?|pts?|points?)\s*\)?\]?/i;
const MARKS_RE_G = new RegExp(MARKS_RE.source, "gi");
const COMMAND_START =
  /^(?:critically\s+)?(?:evaluate|analy[sz]e|assess|discuss|explain|describe|examine|compare|contrast|recommend|propose|justify|explore|investigate|identify|outline|define|apply|develop|design|derive|show|prove|calculate|state|summari[sz]e|distinguish|illustrate)\b/i;

/**
 * True for lines that are brief metadata or section banners, never questions:
 * "Word Count: 2,000" or "PART 1: Some title - 25 MARKS".
 */
export function isNonQuestionBriefLine(line: string): boolean {
  const t = line.trim();
  if (/^(?:total\s+)?(?:word\s*count|word\s*limit|words?|marks?|module\s*code|course\s*code)\b\s*[:\-–]/i.test(t)) return true;
  if (/^(?:part|section)\s*[\da-z]+\s*[:\-–.]?.*\(?\b\d+\s*marks?\b\)?\.?$/i.test(t) && !t.endsWith("?")) return true;
  if (
    !t.endsWith("?") &&
    t.split(/\s+/).length <= 10 &&
    /[-–:]\s*\(?\d+\s*marks?\)?\.?$/i.test(t) &&
    !COMMAND_START.test(t)
  ) {
    return true;
  }
  return false;
}

export interface BriefQuestionRow {
  id: string;
  /** "Q1a", "Q2" ... */
  label: string;
  /** One-sentence summary of the question, marks and labels removed. */
  text: string;
  /** Marks stated in the brief for this question, if any. */
  marks?: number;
  /** Part/section heading the question sits under, if any. */
  part?: string;
}

export interface BriefPart {
  name: string;
  marks?: number;
}

const PART_RE = /^(?:part|section)\s*([\da-z]+)\s*[:\-–.]?\s*(.*)$/i;
const MAIN_RE = /^(?:q(?:uestion)?\s*)?(\d{1,2})\s*[\(]?\s*([a-z])?\s*[\)\.:\-–]\s*(.+)$/i;
const SUB_RE = /^\(?([a-z])[\)\.]\s+(.+)$/i;

function firstSentence(text: string, max = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.+?[.?!])(?:\s|$)/);
  let s = m && m[1].length >= 20 ? m[1] : clean;
  if (s.length > max) s = `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  return s.replace(/[.\s]+$/, "");
}

function pullMarks(text: string): { text: string; marks?: number } {
  const m = text.match(MARKS_RE);
  if (!m) return { text };
  const marks = parseInt(m[1], 10);
  return { text: text.replace(MARKS_RE_G, " ").replace(/\s{2,}/g, " ").trim(), marks: marks > 0 ? marks : undefined };
}

/** Parts (e.g. "PART 1: QUANTUM HARDWARE ARCHITECTURES 25 MARKS") found in the brief. */
export function parseBriefParts(briefText: string): BriefPart[] {
  const parts: BriefPart[] = [];
  for (const raw of briefText.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(PART_RE);
    if (!m || !m[2]) continue;
    const { text, marks } = pullMarks(m[2]);
    if (text.length < 3) continue;
    parts.push({ name: text.replace(/[:\-–\s]+$/, ""), marks });
  }
  return parts;
}

/**
 * Parse the real questions of a brief (Q1a, Q1b, Q2 ...) with the marks the
 * brief states. Word-count lines and part headings never become questions.
 */
export function parseBriefQuestions(briefText: string): BriefQuestionRow[] {
  const rows: BriefQuestionRow[] = [];
  let currentMain: string | undefined;
  let currentPart: string | undefined;
  const lines = removeCourseCodes(briefText.slice(0, 60000)).split(/\r?\n/);

  const push = (label: string, body: string) => {
    const { text, marks } = pullMarks(body);
    const clean = firstSentence(text);
    if (clean.length < 8 || isNonQuestionBriefLine(clean)) return;
    rows.push({ id: label.toLowerCase(), label, text: clean, marks, part: currentPart });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const part = line.match(PART_RE);
    if (part && part[2]) {
      currentPart = pullMarks(part[2]).text.replace(/[:\-–\s]+$/, "");
      currentMain = undefined;
      continue;
    }
    if (isNonQuestionBriefLine(line)) continue;

    const main = line.match(MAIN_RE);
    if (main) {
      currentMain = main[1];
      push(`Q${main[1]}${(main[2] || "").toLowerCase()}`, main[3]);
      continue;
    }
    const sub = currentMain ? line.match(SUB_RE) : null;
    if (sub && currentMain) {
      push(`Q${currentMain}${sub[1].toLowerCase()}`, sub[2]);
    }
  }

  // Unique ids
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

export interface MarkingCriterionRow {
  criterion: string;
  marks?: number;
  /** Percentage of the total, when marks are known. */
  weightPercent?: number;
  expectation: string;
}

/**
 * Marking criteria stated by the brief. Falls back to rows built from the
 * brief's own mark distribution (parts, else main questions) when it has no
 * separate rubric table.
 */
export function parseMarkingCriteria(briefText: string, questions: BriefQuestionRow[] = parseBriefQuestions(briefText)): MarkingCriterionRow[] {
  const lines = briefText.split(/\r?\n/).map((l) => l.trim());
  const rows: MarkingCriterionRow[] = [];
  const startIdx = lines.findIndex((l) => /\b(marking|grading|assessment)\s+(criteria|scheme|rubric)\b|\bcriteria\s*&\s*weight/i.test(l));
  if (startIdx >= 0) {
    for (const line of lines.slice(startIdx + 1, startIdx + 16)) {
      if (!line) {
        if (rows.length) break;
        continue;
      }
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      const src = cells.length >= 2 ? cells.join(" – ") : line;
      const m = src.match(/^[-*•\d.\)\s]*(.+?)\s*[:–\-]?\s*\(?(\d{1,3})\s*(%|marks?)\)?\s*[:–\-]?\s*(.*)$/i);
      if (m && m[1].trim().length >= 3) {
        const value = parseInt(m[2], 10);
        rows.push({
          criterion: m[1].replace(/[:–\-\s]+$/, ""),
          marks: m[3] === "%" ? undefined : value,
          weightPercent: m[3] === "%" ? value : undefined,
          expectation: m[4]?.trim() && m[4].trim().length <= 80 ? m[4].trim() : plainExpectation(questions.filter((q) => new RegExp(`\\b${q.label}\\b`, "i").test(m[1]))),
        });
      }
    }
    if (rows.length >= 2) return finishCriteria(rows, statedTotalMarks(briefText));
    rows.length = 0;
  }

  const parts = parseBriefParts(briefText).filter((p) => p.marks);
  if (parts.length >= 2) {
    return finishCriteria(
      parts.map((p) => {
        const inPart = questions.filter((q) => q.part && p.name.toLowerCase().startsWith(q.part.toLowerCase().slice(0, 20)));
        return {
          criterion: p.name,
          marks: p.marks,
          expectation: plainExpectation(inPart),
        };
      }),
      statedTotalMarks(briefText)
    );
  }

  const byMain = new Map<string, { marks: number; first: BriefQuestionRow }>();
  for (const q of questions) {
    if (!q.marks) continue;
    const key = q.label.replace(/[a-z]$/, "");
    const cur = byMain.get(key);
    byMain.set(key, { marks: (cur?.marks ?? 0) + q.marks, first: cur?.first ?? q });
  }
  const grouped = [...byMain.entries()].map(([key, v]) => ({
    criterion: `${key}: ${v.first.text.slice(0, 60)}`,
    marks: v.marks,
    expectation: plainExpectation(questions.filter((q) => q.label.replace(/[a-z]$/, "") === key)),
  }));
  return grouped.length ? finishCriteria(grouped, statedTotalMarks(briefText)) : [];
}

const PART_LABEL = /^(?:part|section)\s*[\da-z]+/i;

/**
 * Percentages need ONE denominator. Never sum Part totals AND the questions
 * inside them. Priority: a stated "Total: N marks", else the Part totals when
 * the brief has Parts, else the sum of the rows.
 */
function finishCriteria(rows: MarkingCriterionRow[], statedTotal?: number): MarkingCriterionRow[] {
  const partRows = rows.filter((r) => PART_LABEL.test(r.criterion) && r.marks);
  const leafSum = rows.filter((r) => !PART_LABEL.test(r.criterion)).reduce((s, r) => s + (r.marks ?? 0), 0);
  const partSum = partRows.reduce((s, r) => s + (r.marks ?? 0), 0);
  const total = statedTotal ?? (partRows.length >= 2 ? partSum : partRows.length ? partSum + leafSum : leafSum);
  return rows.map((r) => ({
    ...r,
    weightPercent: r.weightPercent ?? (r.marks && total > 0 ? Math.round((r.marks / total) * 100) : undefined),
  }));
}

/** "Total: 100 marks" / "(100 marks in total)" if the brief states it. */
export function statedTotalMarks(briefText: string): number | undefined {
  const m =
    briefText.match(/\btotal\s*(?:marks?|mark\s*available)?\s*[:=\-–]?\s*(\d{2,4})\s*(?:marks?)?\b/i) ||
    briefText.match(/\b(\d{2,4})\s*marks?\s*(?:in\s*total|total)\b/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return n >= 10 && n <= 1000 ? n : undefined;
}

const VERB_PLAIN: Record<string, string> = {
  compare: "compare them point by point",
  contrast: "show how they differ",
  explain: "explain how and why in your own words",
  describe: "describe it clearly and accurately",
  evaluate: "weigh strengths and weaknesses and reach a judgement",
  assess: "weigh the evidence and reach a judgement",
  discuss: "set out the main views, then give your conclusion",
  analyse: "break it into parts and explain how they connect",
  analyze: "break it into parts and explain how they connect",
  derive: "show each step of the working",
  justify: "give reasons and evidence for your choice",
  propose: "suggest a clear solution and say why it works",
  recommend: "make a clear recommendation and back it up",
  examine: "look closely at the evidence and explain what it shows",
  design: "set out your design and why it meets the need",
  calculate: "show the working and the result",
  define: "define the key terms precisely",
  identify: "pick out the key points and explain them",
  outline: "set out the main steps or points in order",
};

/** One short, plain-English sentence on how to earn the marks, from the question verbs only. */
export function plainExpectation(questions: BriefQuestionRow[]): string {
  const verbs: string[] = [];
  for (const q of questions) {
    const first = q.text.toLowerCase().match(/^(?:critically\s+)?([a-z]+)/)?.[1];
    const plain = first ? VERB_PLAIN[first] : undefined;
    if (plain && !verbs.includes(plain)) verbs.push(plain);
  }
  const tail = verbs.length ? `: ${verbs.slice(0, 2).join(", and ")}` : "";
  return `Answer every part fully${tail}, with evidence.`;
}

export interface BriefSummaryInput {
  briefText: string;
  assignmentType?: string;
  level?: string;
  citationStyle?: string;
  targetWords?: number;
  questions?: BriefQuestionRow[];
  /** AI-written plain-English statements, preferred when present. */
  aiProduce?: string;
  aiApproach?: string;
}

const VERB_FORMS: Record<string, string> = {
  compare: "compare", contrast: "contrast", evaluate: "evaluate", analyse: "analyse", analyze: "analyse", assess: "assess",
  discuss: "discuss", explain: "explain", describe: "describe", derive: "derive", justify: "justify", propose: "propose",
  recommend: "recommend", examine: "examine", design: "design", critically: "evaluate", calculate: "calculate", define: "define",
  explore: "explore", investigate: "investigate", identify: "identify", outline: "outline", apply: "apply", show: "show", prove: "prove",
};

/**
 * A 2–3 sentence plain-English synthesis: the subject and purpose, the analytical
 * approach, and the formatting constraints. Never contains the pasted brief.
 */
export function buildBriefSummary(input: BriefSummaryInput): string {
  const questions = input.questions ?? parseBriefQuestions(input.briefText);
  const parts = parseBriefParts(input.briefText);
  const type = (input.assignmentType || "assignment").replace(/_/g, " ");
  const level = input.level ? `${input.level} ` : "";
  const sentences: string[] = [];

  if (input.aiProduce) {
    sentences.push(input.aiProduce.replace(/\s+/g, " ").trim().replace(/[.\s]*$/, "."));
    if (input.aiApproach) sentences.push(input.aiApproach.replace(/\s+/g, " ").trim().replace(/[.\s]*$/, "."));
  } else {
    const subject = parts.length
      ? parts.map((p) => p.name.toLowerCase()).slice(0, 3).join(", ")
      : questions[0]?.text.toLowerCase().slice(0, 90);
    sentences.push(
      questions.length
        ? `This ${level}${type} asks you to answer ${questions.length} question${questions.length === 1 ? "" : "s"}${subject ? `, covering ${subject}` : ""}.`
        : `This ${level}${type} is assessed on the brief you supplied.`
    );
    const verbs: string[] = [];
    for (const q of questions) {
      const first = q.text.toLowerCase().match(/^(?:critically\s+)?([a-z]+)/)?.[1];
      const v = first ? VERB_FORMS[first] : undefined;
      if (v && !verbs.includes(v)) verbs.push(v);
    }
    if (verbs.length) {
      const list = verbs.length > 1 ? `${verbs.slice(0, -1).join(", ")} and ${verbs[verbs.length - 1]}` : verbs[0];
      sentences.push(`You are asked to ${list}, so each answer needs reasoned analysis backed by evidence rather than description alone.`);
    }
  }

  const total = questions.reduce((s, q) => s + (q.marks ?? 0), 0);
  const constraints = [
    input.targetWords ? `${input.targetWords.toLocaleString()} words` : "",
    input.citationStyle ? `${input.citationStyle.toUpperCase()} referencing` : "",
    total > 0 ? `${total} marks in total` : "",
  ].filter(Boolean);
  if (constraints.length) sentences.push(`It must be ${constraints.join(", ")}.`);
  return sentences.slice(0, 3).join(" ");
}

export interface PrescribedReference {
  /** e.g. "Preskill (2018)" */
  label: string;
  authors: string;
  year: number;
}

/**
 * Citations already named inside the brief: "Preskill (2018)", "Arute et al. (2019)",
 * "Nielsen & Chuang (2010)", "(Shor, 1994)".
 */
export function extractPrescribedReferences(briefText: string): PrescribedReference[] {
  const text = briefText.slice(0, 60000);
  const out: PrescribedReference[] = [];
  const seen = new Set<string>();
  const add = (authors: string, year: string) => {
    const a = authors.replace(/\s+/g, " ").trim();
    const y = parseInt(year, 10);
    if (!a || y < 1800 || y > 2100) return;
    const key = `${a.toLowerCase()}|${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: `${a} (${y})`, authors: a, year: y });
  };
  const name = "[A-Z][A-Za-zÀ-ÿ'’\\-]+";
  const authorRe = `${name}(?:\\s+(?:et\\s+al\\.?|(?:&|and)\\s+${name}))?`;
  const narrative = new RegExp(`\\b(${authorRe})\\s*\\((\\d{4})[a-z]?\\)`, "g");
  const parenthetical = new RegExp(`\\(\\s*(${authorRe}),?\\s+(\\d{4})[a-z]?\\s*\\)`, "g");
  let m: RegExpExecArray | null;
  while ((m = narrative.exec(text))) add(m[1], m[2]);
  while ((m = parenthetical.exec(text))) add(m[1], m[2]);
  return out.slice(0, 20);
}
