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

// "mK" (millikelvin) is not "marks": only full words count.
const MARKS_RE = /\[?\(?\s*(\d{1,3})\s*(?:marks?|pts|points?)\b\s*\)?\]?/i;
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
  // A full stop in "vs.", "e.g.", "et al." or "Fig." does not end the sentence.
  const masked = clean.replace(/\b(vs|e\.g|i\.e|et al|etc|cf|fig|eq|no|dr|prof)\./gi, (m) => m.replace(/\./g, "\u0000"));
  const mm = masked.match(/^(.+?[.?!])(?:\s|$)/);
  const m = mm ? [mm[0], mm[1].replace(/\u0000/g, ".")] : null;
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

const MARKS_WORD = "(?:marks?|pts|points?)";

/**
 * Undo the line layout PDF/DOCX extraction gives a brief, so every parser sees
 * one item per line:
 * - a marks bracket split over two lines ("Title [" / "15 Marks]") is rejoined;
 * - a bare "[15 Marks]" line is appended to the heading above it;
 * - "Question 1: Title [15 Marks] Prompt..." on one line becomes heading + prompt;
 * - an inline "a. Explain ..." sub-part, "Question 2:" or "PART 2:" starts a line.
 */
export function normalizeBriefLayout(text: string): string {
  if (!text) return "";
  let t = text.replace(/\r\n?/g, "\n");
  // "Title [\n15 Marks]" / "Title (\n15 marks)"
  t = t.replace(new RegExp(`([\\[(])[ \\t]*\\n[ \\t]*(\\d{1,3}\\s*${MARKS_WORD}\\s*[\\])])`, "gi"), "$1$2");
  // A line that is only "[15 Marks]" or "15 Marks]" joins the line above.
  t = t.replace(new RegExp(`\\n[ \\t]*([\\[(]?\\s*\\d{1,3}\\s*${MARKS_WORD}\\s*[\\])])[ \\t]*(?=\\n|$)`, "gi"), (_m, b: string) => ` ${b.startsWith("[") || b.startsWith("(") ? b : `[${b}`}`);
  // Inline headings and sub-parts after a sentence or bracket end.
  t = t.replace(/([.?!\]):])[ \t]+(?=(?:Question|Q)\s*\d{1,2}\s*[:.)\-–])/g, "$1\n");
  t = t.replace(/([.?!\]])[ \t]+(?=PART\s+\d+\s*[:\-–])/g, "$1\n");
  t = t.replace(/([.?!\]])[ \t]+(?=\(?[a-h][.)]\s+(?:critically\s+)?[A-Z][a-z]+\b)/g, (m, end: string, offset: number, whole: string) => {
    const rest = whole.slice(offset + m.length).replace(/^\(?[a-h][.)]\s+/, "");
    return COMMAND_START.test(rest) ? `${end}\n` : m;
  });
  // "Question 1: Title [15 Marks] Current NISQ devices..." -> heading, then prompt.
  t = t
    .split("\n")
    .map((line) => {
      const m = line.match(new RegExp(`^(\\s*(?:(?:Question|Q)\\s*\\d{1,2}|PART\\s+\\d+)\\b[^\\[\\]]*?\\[\\s*\\d{1,3}\\s*${MARKS_WORD}\\s*\\])\\s+(\\S.*)$`, "i"));
      return m && m[2].split(/\s+/).length >= 3 ? `${m[1]}\n${m[2]}` : line;
    })
    .join("\n");
  return t;
}

/** Running page headers/footers that PDF extraction repeats on every page. */
export function isPageFurnitureLine(line: string): boolean {
  const t = line.trim();
  return /\bpage\s+\d+\s+(?:of|\/)\s+\d+\b/i.test(t) || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(t);
}

/** Remove page furniture and any line repeated 3+ times (running headers/footers). */
export function stripPageFurniture(text: string): string {
  const lines = text.split(/\r?\n/);
  const counts = new Map<string, number>();
  for (const l of lines) {
    const k = l.trim();
    if (k.length >= 12) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return lines.filter((l) => !isPageFurnitureLine(l) && (counts.get(l.trim()) ?? 0) < 3).join("\n");
}

/** Part headings after which the brief lists rubric rows or references, not questions. */
const NON_QUESTION_PART = /\b(rubric|marking|grading|assessment\s+criteria|bibliography|references?|reading\s+list|prescribed\s+(?:texts?|reading))\b/i;

/** Parts (e.g. "PART 1: QUANTUM HARDWARE ARCHITECTURES 25 MARKS") found in the brief. */
export function parseBriefParts(briefText: string): BriefPart[] {
  const parts: BriefPart[] = [];
  for (const raw of normalizeBriefLayout(briefText).split(/\r?\n/)) {
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
  const lines = removeCourseCodes(stripPageFurniture(normalizeBriefLayout(briefText.slice(0, 60000)))).split(/\r?\n/);

  const push = (label: string, body: string) => {
    const { text, marks } = pullMarks(body);
    const clean = firstSentence(text).replace(/\s*[\[(]\s*$/, "").trim();
    if (clean.length < 8 || isNonQuestionBriefLine(clean)) return;
    rows.push({ id: label.toLowerCase(), label, text: clean, marks, part: currentPart });
  };

  let inNonQuestionPart = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isPageFurnitureLine(line)) continue;
    const part = line.match(PART_RE);
    if (part && part[2]) {
      currentPart = pullMarks(part[2]).text.replace(/[:\-–\s]+$/, "");
      currentMain = undefined;
      inNonQuestionPart = NON_QUESTION_PART.test(currentPart);
      continue;
    }
    if (inNonQuestionPart || /^(?:references|bibliography|reference\s+list)\s*:?$/i.test(line)) {
      inNonQuestionPart = true;
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
  const lines = normalizeBriefLayout(briefText).split(/\r?\n/).map((l) => l.trim());
  const rows: MarkingCriterionRow[] = [];
  // The rubric starts at its own heading: a rubric Part, or a "Marking criteria" /
  // "Criteria & Weight" line. The last such heading wins (a cover-page mention
  // of "assessment" is not the rubric).
  const isRubricHeading = (l: string) =>
    (PART_RE.test(l) && /\b(rubric|marking|grading|criteria)\b/i.test(l)) ||
    /^(?:standard\s+)?(?:assessment\s+|marking\s+|grading\s+)?(?:criteria|rubric|scheme)\b/i.test(l) ||
    /\b(marking|grading)\s+(criteria|scheme|rubric)\b|\bcriteria\s*&\s*weight/i.test(l);
  let startIdx = -1;
  lines.forEach((l, i) => {
    if (isRubricHeading(l)) startIdx = i;
  });
  // Prefer the first heading of a consecutive run ("PART 5: RUBRIC" then "Criteria & Weight").
  while (startIdx > 0 && isRubricHeading(lines[startIdx - 1])) startIdx -= 1;
  if (startIdx >= 0) {
    for (const line of lines.slice(startIdx + 1, startIdx + 30)) {
      if (!line) {
        if (rows.length) break;
        continue;
      }
      if (PART_RE.test(line) && !isRubricHeading(line)) break;
      // Grade-band headers ("First Class (1st)", "70%+", "60-69%", "2:1") and question rows are not criteria.
      if (isRubricHeading(line)) continue;
      if (/^\d{1,3}\s*%\s*\+|^\d{1,3}\s*[-–]\s*\d{1,3}\s*%|\b(first\s+class|upper\s+second|lower\s+second|third\s+class|distinction|merit|pass|fail)\b.*\(\s*(?:1st|2:1|2:2|3rd)\s*\)/i.test(line)) continue;
      // Question rows ("Question 1: ...", "Q2.", "a. Explain ...") are not criteria; a numbered
      // rubric row ("1. Technical & Conceptual Rigour (30%)") is.
      if (/^(?:q(?:uestion)?\s*)\d/i.test(line) || (SUB_RE.test(line) && !/\d\s*%/.test(line))) continue;
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      const src = cells.length >= 2 ? cells.join(" – ") : line;
      const m = src.match(/^[-*•\d.\)\s]*([A-Za-z][^%]*?)\s*[:–\-]?\s*\(?(\d{1,3})\s*(%|marks?)\)?\s*[:–\-]?\s*(.*)$/i);
      if (m && m[1].trim().length >= 3 && m[1].trim().split(/\s+/).length <= 10) {
        const value = parseInt(m[2], 10);
        const tail = m[4]?.trim() ?? "";
        rows.push({
          criterion: m[1].replace(/[:–\-\s]+$/, ""),
          marks: m[3] === "%" ? undefined : value,
          weightPercent: m[3] === "%" ? value : undefined,
          expectation: tail && tail.length <= 120 ? firstSentence(tail, 120) + "." : criterionExpectation(m[1]),
        });
      }
    }
    if (rows.length >= 2) return finishCriteria(rows, statedTotalMarks(briefText));
    rows.length = 0;
  }

  const parts = parseBriefParts(briefText).filter((p) => p.marks && !NON_QUESTION_PART.test(p.name));
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

  const grouped = groupBriefQuestions(questions)
    .filter((g) => g.marks)
    .map((g) => ({
      criterion: `${g.key}: ${g.title.slice(0, 60)}`,
      marks: g.marks,
      expectation: plainExpectation([...(g.stem ? [g.stem] : []), ...g.parts]),
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
    briefText.match(/\btotal\s+(?:assessment|available|score)\s*[:=\-–]?\s*(\d{2,4})\s*marks?\b/i) ||
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

const CRITERION_PLAIN: Array<[RegExp, string]> = [
  [/rigou?r|technical|conceptual|knowledge|understanding|accuracy/i, "Use technical terms precisely and explain each concept correctly."],
  [/synthes|evaluat|critical|analy|argument/i, "Weigh the evidence and competing views, then reach clear, justified judgements."],
  [/method|application|apply|problem|calculation/i, "Apply the right models or methods to each question and show your working."],
  [/referenc|citation|style|harvard|apa|presentation|format/i, "Cite every source correctly in the required style, with a complete reference list."],
  [/structure|organi[sz]ation|coheren|clarity|writing|communication/i, "Organise each answer logically with clear signposting and concise prose."],
  [/research|evidence|literature|sources/i, "Support every main point with relevant, credible academic sources."],
  [/original|insight|creativ/i, "Go beyond summary: offer your own reasoned insight."],
];

/** One plain-English sentence for a rubric criterion named in the brief. */
export function criterionExpectation(criterion: string): string {
  return CRITERION_PLAIN.find(([re]) => re.test(criterion))?.[1] ?? "Meet this criterion fully, with clear reasoning and evidence.";
}

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

/** Acronyms the brief itself writes in mixed-case prose (NISQ, QEC, BQP, ML-KEM ...). */
export function briefAcronyms(briefText: string): Set<string> {
  const out = new Set<string>();
  for (const line of briefText.split(/\r?\n/)) {
    const letters = line.replace(/[^A-Za-z]/g, "");
    if (!letters || letters.replace(/[^A-Z]/g, "").length / letters.length > 0.35) continue; // a banner or heading
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9]{1,4}(?:-[A-Z0-9]{1,6})*\b/g)) out.add(m[0]);
  }
  return out;
}

/**
 * An all-caps heading in readable sentence case for prose ("QUANTUM ERROR
 * CORRECTION (QEC) AND FAULT TOLERANCE" -> "quantum error correction (QEC) and
 * fault tolerance"); acronyms and mixed-case headings are kept as written.
 */
export function readableHeading(heading: string, acronyms: Set<string> = new Set()): string {
  const h = heading.replace(/\s+/g, " ").trim();
  const letters = h.replace(/[^A-Za-z]/g, "");
  if (!letters || letters.replace(/[^A-Z]/g, "").length / letters.length < 0.7) return h;
  return h.replace(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g, (w) => {
    if (acronyms.has(w) || /\d/.test(w)) return w;
    const inParens = new RegExp(`\\(${w}\\)`).test(h);
    return inParens ? w : w.toLowerCase();
  });
}

const STYLE_NAMES: Record<string, string> = {
  apa: "APA", apa7: "APA 7th", harvard: "Harvard", mla: "MLA", mla9: "MLA 9th", ieee: "IEEE", chicago: "Chicago",
  "chicago-notes": "Chicago (notes)", vancouver: "Vancouver", oscola: "OSCOLA",
};
function citationStyleName(style: string): string {
  const key = style.trim().toLowerCase().replace(/\s+/g, "");
  return STYLE_NAMES[key] ?? style.toUpperCase();
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
  const groups = groupBriefQuestions(questions);
  const acronyms = briefAcronyms(input.briefText);
  const parts = parseBriefParts(input.briefText)
    .filter((p) => !NON_QUESTION_PART.test(p.name))
    .map((p) => ({ ...p, name: readableHeading(p.name, acronyms) }));
  const type = (input.assignmentType || "assignment").replace(/_/g, " ");
  const level = input.level ? `${input.level} ` : "";
  const sentences: string[] = [];

  if (input.aiProduce) {
    sentences.push(input.aiProduce.replace(/\s+/g, " ").trim().replace(/[.\s]*$/, "."));
    if (input.aiApproach) sentences.push(input.aiApproach.replace(/\s+/g, " ").trim().replace(/[.\s]*$/, "."));
  } else {
    const subject = parts.length
      ? parts.map((p) => p.name).slice(0, 4).join(", ")
      : groups[0] ? readableHeading(groups[0].title, acronyms).slice(0, 90) : undefined;
    sentences.push(
      groups.length
        ? `This ${level}${type} asks you to answer ${groups.length} question${groups.length === 1 ? "" : "s"}${subject ? `, covering ${subject}` : ""}.`
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

  // A stem's marks already include its sub-parts: never add them twice.
  const total = statedTotalMarks(input.briefText) ?? groups.reduce((s, g) => s + (g.marks ?? 0), 0);
  const constraints = [
    input.targetWords ? `${input.targetWords.toLocaleString()} words` : "",
    input.citationStyle ? `${citationStyleName(input.citationStyle)} referencing` : "",
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

/** A short (about 8 word) label for a question: drops the leading command verb. */
export function shortQuestionLabel(text: string, maxWords = 8): string {
  const stripped = text
    .replace(/^(?:critically\s+)?(?:compare|contrast|evaluate|analy[sz]e|assess|discuss|explain|describe|examine|derive|justify|propose|recommend|explore|investigate|identify|outline|define|apply|develop|design|calculate|show)\s+/i, "")
    .replace(/[?.:]+$/, "")
    .trim();
  const w = stripped.split(/\s+/);
  return w.length > maxWords ? `${w.slice(0, maxWords).join(" ")}…` : stripped;
}

export interface BriefQuestionGroup {
  /** "Q1" */
  key: string;
  /** Question heading: the stem's own title when the brief gives one. */
  title: string;
  stem?: BriefQuestionRow;
  /** Sub-parts (a), (b), (c) ... answered inside the same section. */
  parts: BriefQuestionRow[];
  /** The question's marks: the stem's marks, else the sum of its parts' marks. */
  marks?: number;
  part?: string;
}

/**
 * One group per main question. A stem and its sub-parts are never split, and
 * marks are never double-counted (a stem's "[15 Marks]" covers its parts).
 */
export function groupBriefQuestions(rows: BriefQuestionRow[]): BriefQuestionGroup[] {
  const map = new Map<string, BriefQuestionGroup>();
  for (const r of rows) {
    const key = r.label.replace(/[a-z]$/, "");
    const g = map.get(key) ?? { key, title: "", parts: [], part: r.part };
    if (r.label === key) g.stem = r;
    else g.parts.push(r);
    map.set(key, g);
  }
  return [...map.values()].map((g) => {
    const partMarks = g.parts.reduce((n, p) => n + (p.marks ?? 0), 0);
    const marks = g.stem?.marks ?? (partMarks > 0 ? partMarks : undefined);
    const title = g.stem?.text || g.parts[0]?.text || g.key;
    return { ...g, marks, title };
  });
}

export interface PrescribedBibliographyEntry {
  /** "Surname, I." strings, in order. */
  authors: string[];
  /** The entry says "et al." after the listed authors. */
  etAl: boolean;
  year: number;
  title: string;
  /** Journal or proceedings name; for books, the publisher. */
  venue?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  isBook: boolean;
  /** "Arute et al. (2019)" */
  label: string;
  raw: string;
}

const BIB_HEADER = /\b(bibliography|references?|reference\s+list|reading\s+list|prescribed\s+(?:texts?|reading))\b/i;
const ENTRY_START = /^[\p{Lu}][\p{L}'’\-]+(?:\s[\p{Lu}][\p{L}'’\-]+)?,\s*(?:[\p{Lu}]\.?\s?-?){1,4}/u;

/**
 * Full entries from a reference list printed in the brief ("PART 6: PRESCRIBED
 * HARVARD REFERENCING BIBLIOGRAPHY"): authors, year, title, venue, volume,
 * issue, pages and DOI exactly as the brief gives them.
 */
export function parsePrescribedBibliography(briefText: string): PrescribedBibliographyEntry[] {
  const lines = stripPageFurniture(normalizeBriefLayout(briefText)).split(/\r?\n/).map((l) => l.trim());
  // The header may carry the first entries on the same line:
  // "PART 6: PRESCRIBED HARVARD REFERENCING BIBLIOGRAPHY CORE ACADEMIC LITERATURE Arute, F., ..."
  const headerTail = (l: string) => {
    const at = l.search(/[\p{Lu}][\p{Ll}][\p{L}'’\-]*,\s*(?:[\p{Lu}]\.\s?-?){1,4}/u);
    return at > 0 && BIB_HEADER.test(l.slice(0, at)) ? at : -1;
  };
  const start = lines.findIndex(
    (l) => BIB_HEADER.test(l) && (PART_RE.test(l) || /^[A-Z\s&]+$/.test(l) || l.length < 60 || headerTail(l) > 0)
  );
  if (start < 0) return [];
  const body: string[] = [];
  const tailAt = headerTail(lines[start]);
  if (tailAt > 0) body.push(lines[start].slice(tailAt));
  for (const l of lines.slice(start + 1)) {
    if (!l) continue;
    if (PART_RE.test(l)) break;
    body.push(l);
  }
  // Join wrapped lines, then split where a new "Surname, I. ... (YEAR)" entry
  // begins after the previous entry's final full stop.
  const joined = body.join(" ").replace(/\s+/g, " ");
  const entries = joined
    .split(/(?<=\.)\s+(?=[\p{Lu}][\p{L}'’\-]+(?:\s[\p{Lu}][\p{L}'’\-]+)?,\s*(?:[\p{Lu}]\.\s?-?){1,4}[^()]{0,400}?\(\d{4}[a-z]?\))/u)
    .map((e) => e.trim())
    .filter((e) => ENTRY_START.test(e) && /\(\d{4}[a-z]?\)/.test(e));
  const out: PrescribedBibliographyEntry[] = [];
  for (const raw of entries) {
    const m = raw.match(/^(.+?)\s*\((\d{4})[a-z]?\)\s*(.+)$/);
    if (!m) continue;
    const etAl = /\bet\.?\s*al\.?/i.test(m[1]);
    const authorPart = m[1].replace(/,?\s*\bet\.?\s*al\.?/i, "").replace(/\s+and\s+|\s*&\s*/g, ", ");
    const authors = [...authorPart.matchAll(/([\p{Lu}][\p{L}'’\-]+(?:\s[\p{Lu}][\p{L}'’\-]+)?),\s*((?:[\p{Lu}]\.?\s?-?){1,4})/gu)].map(
      (a) => `${a[1]}, ${a[2].replace(/\s+/g, "").replace(/([A-Z])(?=[A-Z])/g, "$1.").replace(/\.?$/, ".")}`
    );
    let rest = m[3].trim();
    const doiMatch = rest.match(/(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\S+?)\.?\s*$/i);
    const doi = doiMatch?.[1];
    if (doiMatch) rest = rest.slice(0, doiMatch.index).trim().replace(/[.,]$/, "");
    let title = "";
    let after = "";
    const quoted = rest.match(/^['‘"“](.+?)['’"”],?\s*(.*)$/);
    if (quoted) {
      title = quoted[1];
      after = quoted[2];
    } else {
      const dot = rest.search(/\.\s/);
      title = dot > 0 ? rest.slice(0, dot) : rest;
      after = dot > 0 ? rest.slice(dot + 1).trim() : "";
    }
    const isBook = !quoted;
    const venue = isBook ? undefined : after.split(/,\s*(?=\d|pp?\.|vol)/i)[0].replace(/[.,]\s*$/, "").trim() || undefined;
    const vi = after.match(/\b(\d+)\s*\((\d+)\)/);
    const volOnly = !vi ? after.match(/,\s*(\d+)\s*,/) : null;
    const pages = after.match(/\bpp?\.\s*([\d]+(?:\s*[–-]\s*\d+)?)/)?.[1]?.replace(/\s/g, "") ?? after.match(/,\s*(\d{5,7})\b/)?.[1];
    const publisher = isBook ? after.match(/:\s*([^.:]+?)\.?\s*$/)?.[1]?.trim() : undefined;
    const year = parseInt(m[2], 10);
    const fam = (a: string) => a.split(",")[0];
    const label =
      etAl || authors.length > 2
        ? `${fam(authors[0] ?? m[1])} et al. (${year})`
        : authors.length === 2
        ? `${fam(authors[0])} and ${fam(authors[1])} (${year})`
        : `${fam(authors[0] ?? m[1])} (${year})`;
    out.push({ authors, etAl, year, title: title.trim(), venue, publisher, volume: vi?.[1] ?? volOnly?.[1], issue: vi?.[2], pages, doi, isBook, label, raw });
  }
  return out;
}
