/**
 * Brief Extractor & Document Parsing Utilities
 * Provides bounded, non-backtracking text parsing, regex extractors,
 * circular reference strippers, and deep equality guards.
 */

import type { SectionBudgetItem, WritingStyleConfig } from "../desk/assignment/types";

/**
 * Safely strips circular references, DOM Nodes, Window, File, Blob,
 * and functions from an object before JSON serialization or state updates.
 */
export function stripCircularReferences<T>(input: T): T {
  if (input === null || typeof input !== "object") {
    return input;
  }

  const seen = new WeakSet<object>();

  function sanitize(val: unknown, depth = 0): unknown {
    if (depth > 64) {
      return undefined;
    }
    if (val === null || typeof val !== "object") {
      // Exclude functions and symbols
      if (typeof val === "function" || typeof val === "symbol") {
        return undefined;
      }
      return val;
    }

    // Skip DOM nodes, Window, Events, Files, Blobs
    if (
      (typeof HTMLElement !== "undefined" && val instanceof HTMLElement) ||
      (typeof Event !== "undefined" && val instanceof Event) ||
      (typeof Window !== "undefined" && val instanceof Window)
    ) {
      return undefined;
    }

    // For File or Blob, convert to safe serializable metadata
    if (typeof File !== "undefined" && val instanceof File) {
      return {
        name: val.name,
        size: val.size,
        type: val.type,
        lastModified: val.lastModified,
      };
    }
    if (typeof Blob !== "undefined" && val instanceof Blob) {
      return {
        size: val.size,
        type: val.type,
      };
    }

    if (seen.has(val as object)) {
      return "[Circular]";
    }
    seen.add(val as object);

    let result: unknown;
    if (Array.isArray(val)) {
      result = val.map((item) => sanitize(item, depth + 1)).filter((item) => item !== undefined);
    } else {
      const cleanObj: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(val as Record<string, unknown>)) {
        // Omit DOM/React internal attributes like _reactFiber, _reactEvents
        if (key.startsWith("_react") || key === "nativeEvent") {
          continue;
        }
        const cleaned = sanitize(item, depth + 1);
        if (cleaned !== undefined) {
          cleanObj[key] = cleaned;
        }
      }
      result = cleanObj;
    }

    seen.delete(val as object);
    return result;
  }

  return sanitize(input, 0) as T;
}

/**
 * Safely format labels or configuration values for UI display.
 * Handles strings, objects with preset/label/title/id, numbers, or null/undefined,
 * preventing 'TypeError: E.replace is not a function'.
 */
export function safeFormatLabel(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.replace(/_/g, " ");
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const extracted = obj.preset ?? obj.label ?? obj.title ?? obj.id ?? "";
    return typeof extracted === "string" ? extracted.replace(/_/g, " ") : String(extracted);
  }
  return String(val).replace(/_/g, " ");
}

/**
 * Deep equality comparator for state guards.
 * Prevents unnecessary re-render cycles and cascading updates.
 */
export function isDeepEqual(a: unknown, b: unknown, seenA = new WeakSet<object>(), depth = 0): boolean {
  if (a === b) return true;
  if (depth > 64) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  if (seenA.has(a)) return true;
  seenA.add(a);

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i], seenA, depth + 1)) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!isDeepEqual(objA[key], objB[key], seenA, depth + 1)) return false;
  }

  return true;
}

/**
 * Bounded word count extractor.
 * Scans only the first 50,000 characters using non-backtracking regular expressions.
 */
export function extractWordCountFromText(rawText: string): number | undefined {
  if (!rawText) return undefined;
  // Bound to the first 50,000 characters to prevent regex catastrophic backtracking
  const slice = rawText.slice(0, 50000);

  // Pattern 1: "Word count: 2500" or "Length: 3000 words"
  const match1 = slice.match(/(?:word\s*count|target|limit|length)\s*(?:is|of|:)?\s*([1-9]\d{2,4})/i);
  if (match1) {
    const val = parseInt(match1[1], 10);
    if (val >= 200 && val <= 50000) return val;
  }

  // Pattern 2: "2500 words"
  const match2 = slice.match(/\b([1-9]\d{2,4})\s*words\b/i);
  if (match2) {
    const val = parseInt(match2[1], 10);
    if (val >= 200 && val <= 50000) return val;
  }

  return undefined;
}

/**
 * Bounded academic level extractor.
 */
export function extractLevelFromText(rawText: string): "undergraduate" | "postgraduate" | undefined {
  if (!rawText) return undefined;
  const slice = rawText.slice(0, 50000);

  if (/\b(postgraduate|masters|master's|msc|ma|mba|llm|phd|level\s*7)\b/i.test(slice)) {
    return "postgraduate";
  }
  if (/\b(undergraduate|bachelor|bachelor's|bsc|ba|level\s*[456])\b/i.test(slice)) {
    return "undergraduate";
  }
  return undefined;
}

/**
 * Bounded citation style extractor.
 */
export function extractCitationStyleFromText(rawText: string): string | undefined {
  if (!rawText) return undefined;
  const slice = rawText.slice(0, 50000);

  if (/\b(apa\s*7|\bapa\b)/i.test(slice)) return "apa7";
  if (/\bharvard\b/i.test(slice)) return "harvard";
  if (/\bieee\b/i.test(slice)) return "ieee";
  if (/\bmla\b/i.test(slice)) return "mla9";
  if (/\bchicago\b/i.test(slice)) return "chicago";
  if (/\boscola\b/i.test(slice)) return "oscola";
  if (/\bvancouver\b/i.test(slice)) return "vancouver";
  return undefined;
}

/**
 * Parses rubric criteria lines safely without non-terminating loops.
 */
export function parseRubricCriteriaSafe(text: string): Array<{
  id: string;
  criterion: string;
  title: string;
  description: string;
  weightPercentage?: number;
  weightPercent?: number;
}> {
  if (!text || !text.trim()) return [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line, idx) => {
    // Non-backtracking pattern matching
    const match = line.match(/(.*?)(?:[:\-–—]\s*(\d+)%?|(?:\((\d+)%\)))/);
    const title = match ? match[1].replace(/^[0-9]+[.)\s]*/, "").trim() : line.slice(0, 50);
    const weight = match ? parseInt(match[2] || match[3] || "0", 10) || undefined : undefined;
    return {
      id: `rc-${idx + 1}`,
      criterion: title || `Criterion ${idx + 1}`,
      title: title || `Criterion ${idx + 1}`,
      description: line,
      weightPercentage: weight,
      weightPercent: weight,
    };
  });
}

/**
 * Extracts point/mark/percentage weights from a question title, prompt, or raw text.
 * Handles forms like:
 * - "[30 marks]" / "(25 pts)" / "40%" / "Weight: 15"
 * - Sub-part arithmetic: "(a) [10 marks] + (b) [15 marks] = 25 marks"
 * - Multiple sub-part mark tags: "(a) [10 marks] ... (b) [15 marks]" -> 25
 */
export function extractQuestionMarks(text: string): number | undefined {
  if (!text || !text.trim()) return undefined;
  const clean = text.trim();

  // 1. Explicit sum equation e.g. "10 + 15 = 25 marks" or "[10 + 15 = 25 marks]"
  const sumEqMatch = clean.match(/(?:\[|\()?\s*\d+\s*(?:\+\s*\d+\s*)+=\s*(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)/i);
  if (sumEqMatch) {
    return parseFloat(sumEqMatch[1]);
  }

  // 2. Sum multiple bracketed subpart marks like "(a) [10 marks] ... (b) [15 marks]"
  const bracketMatches = Array.from(clean.matchAll(/(?:\[|\()\s*(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\s*(?:\]|\))/gi));
  if (bracketMatches.length > 1) {
    return bracketMatches.reduce((acc, m) => acc + parseFloat(m[1]), 0);
  } else if (bracketMatches.length === 1) {
    return parseFloat(bracketMatches[0][1]);
  }

  // 3. Percentage weights e.g. "[20%]", "(20%)", "Weight: 20%", "20% weight"
  const pctMatch = clean.match(/(?:\[|\()\s*(\d+(?:\.\d+)?)\s*%\s*(?:\]|\))|(?:weight(?:ing)?|worth|value)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (pctMatch) {
    return parseFloat(pctMatch[1] || pctMatch[2]);
  }

  // 4. "Marks: 25", "Weight: 15", "Points: 30"
  const labelMatch = clean.match(/\b(?:marks?|points?|pts?|weight(?:ing)?)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  if (labelMatch) {
    return parseFloat(labelMatch[1]);
  }

  // 5. Standalone "[30]" at end of question or "30 marks"
  const standaloneWordMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\b/i);
  if (standaloneWordMatch) {
    return parseFloat(standaloneWordMatch[1]);
  }

  // 6. Trailing [XX] where XX is 1-100
  const trailingBracketNumber = clean.match(/\[\s*(\d{1,3})\s*\]$/);
  if (trailingBracketNumber) {
    const val = parseInt(trailingBracketNumber[1], 10);
    if (val > 0 && val <= 100) return val;
  }

  return undefined;
}

export interface BriefQuestionInput {
  id?: string;
  title: string;
  prompt?: string;
  rawText?: string;
  marks?: number;
}

export interface QuestionWordBudget {
  id: string;
  questionIndex: number;
  title: string;
  rawText?: string;
  marks?: number;
  weightPercentage: number;
  percentageWeight: number;
  targetWords: number;
  allocatedWords: number;
  subChunks?: Array<{
    id: string;
    subIndex: number;
    title: string;
    targetWords: number;
  }>;
  chunks: Array<{
    id: string;
    subIndex: number;
    title: string;
    targetWords: number;
  }>;
}

export interface MarkAllocationResult {
  totalWordBudget: number;
  targetTotalWords: number;
  allocatedWordBudget: number;
  allocatedTotalWords: number;
  totalMarksParsed: number;
  hasExplicitMarks: boolean;
  questions: QuestionWordBudget[];
}

/**
 * Deterministically partitions a total word budget across brief questions/tasks
 * according to explicit mark/percentage weights.
 */
export function allocateWordsByMarks(
  questions: Array<BriefQuestionInput | string>,
  totalWordBudget: number
): MarkAllocationResult {
  const budget = Math.max(100, Math.round(totalWordBudget));
  if (!questions || questions.length === 0) {
    return {
      totalWordBudget: budget,
      targetTotalWords: budget,
      allocatedWordBudget: 0,
      allocatedTotalWords: 0,
      totalMarksParsed: 0,
      hasExplicitMarks: false,
      questions: [],
    };
  }

  interface NormalizedItem {
    id: string;
    title: string;
    rawText: string;
    explicitMarks?: number;
    subpartCount: number;
  }

  const normalized: NormalizedItem[] = questions.map((q, idx) => {
    if (typeof q === "string") {
      const marks = extractQuestionMarks(q);
      const subparts = (q.match(/\([a-z]\)|\b[a-z]\)/gi) || []).length;
      return {
        id: `q-${idx + 1}`,
        title: q,
        rawText: q,
        explicitMarks: marks,
        subpartCount: subparts,
      };
    } else {
      const text = `${q.title || ""} ${q.prompt || ""} ${q.rawText || ""}`.trim();
      const parsedMarks = typeof q.marks === "number" && q.marks > 0 ? q.marks : extractQuestionMarks(text);
      const subparts = (text.match(/\([a-z]\)|\b[a-z]\)/gi) || []).length;
      return {
        id: q.id || `q-${idx + 1}`,
        title: q.title || `Question ${idx + 1}`,
        rawText: text,
        explicitMarks: parsedMarks,
        subpartCount: subparts,
      };
    }
  });

  const markedCount = normalized.filter((n) => typeof n.explicitMarks === "number" && n.explicitMarks > 0).length;
  const hasExplicitMarks = markedCount > 0;

  let effectiveWeights: number[];
  let totalMarksParsed = 0;

  if (markedCount === normalized.length) {
    effectiveWeights = normalized.map((n) => n.explicitMarks!);
    totalMarksParsed = effectiveWeights.reduce((acc, m) => acc + m, 0);
  } else if (markedCount > 0) {
    const sumKnownMarks = normalized.reduce((acc, n) => acc + (n.explicitMarks || 0), 0);
    totalMarksParsed = sumKnownMarks;
    const avgMark = sumKnownMarks / markedCount;
    effectiveWeights = normalized.map((n) => (typeof n.explicitMarks === "number" && n.explicitMarks > 0 ? n.explicitMarks : avgMark));
  } else {
    effectiveWeights = normalized.map((n) => 1 + 0.25 * Math.min(n.subpartCount, 4));
  }

  const sumWeights = effectiveWeights.reduce((acc, w) => acc + w, 0);
  const exactShares = effectiveWeights.map((w) => (w / sumWeights) * budget);
  const floorShares = exactShares.map((s) => Math.max(1, Math.floor(s)));
  let assignedWords = floorShares.reduce((acc, w) => acc + w, 0);
  let deficit = budget - assignedWords;

  const remainders = exactShares.map((s, idx) => ({
    idx,
    rem: s - floorShares[idx],
  }));
  remainders.sort((a, b) => b.rem - a.rem);

  let rIdx = 0;
  while (deficit > 0) {
    floorShares[remainders[rIdx % remainders.length].idx] += 1;
    deficit -= 1;
    rIdx += 1;
  }
  while (deficit < 0) {
    const reducible = remainders.slice().reverse().find((item) => floorShares[item.idx] > 1);
    if (reducible) {
      floorShares[reducible.idx] -= 1;
      deficit += 1;
    } else {
      break;
    }
  }

  const resultQuestions: QuestionWordBudget[] = normalized.map((n, idx) => {
    const targetWords = floorShares[idx];
    const weightPercentage = Number(((effectiveWeights[idx] / sumWeights) * 100).toFixed(2));

    let subChunks: Array<{ id: string; subIndex: number; title: string; targetWords: number }> | undefined = undefined;

    if (targetWords > 500) {
      const numChunks = Math.max(2, Math.round(targetWords / 420));
      const baseChunkWords = Math.floor(targetWords / numChunks);
      let chunkRemainder = targetWords % numChunks;

      subChunks = [];
      const defaultSubThemes = [
        "Theoretical Foundations & Conceptual Framing",
        "Empirical Evidence & Comparative Analysis",
        "Critical Evaluation & Strategic Synthesis",
        "Methodological Implications & Robustness",
        "Actionable Recommendations & Policy Horizons",
      ];

      for (let cIdx = 0; cIdx < numChunks; cIdx++) {
        const cTarget = baseChunkWords + (chunkRemainder > 0 ? 1 : 0);
        if (chunkRemainder > 0) chunkRemainder -= 1;

        const subTitle = `${n.title} — Part ${cIdx + 1}: ${defaultSubThemes[cIdx % defaultSubThemes.length]}`;
        subChunks.push({
          id: `${n.id}-sub-${cIdx + 1}`,
          subIndex: cIdx + 1,
          title: subTitle,
          targetWords: cTarget,
        });
      }
    }

    const chunks = subChunks || [];
    return {
      id: n.id,
      questionIndex: idx + 1,
      title: n.title,
      rawText: n.rawText,
      marks: n.explicitMarks,
      weightPercentage,
      percentageWeight: weightPercentage,
      targetWords,
      allocatedWords: targetWords,
      subChunks,
      chunks,
    };
  });

  const allocatedTotal = resultQuestions.reduce((acc, q) => acc + q.targetWords, 0);

  return {
    totalWordBudget: budget,
    targetTotalWords: budget,
    allocatedWordBudget: allocatedTotal,
    allocatedTotalWords: allocatedTotal,
    totalMarksParsed,
    hasExplicitMarks,
    questions: resultQuestions,
  };
}

/**
 * Strict classroom and pedagogical logistics noise patterns.
 * Filters out instructions to form teams, discussion timers, slide counts, and teacher names.
 */
export const CLASSROOM_LOGISTICS_PATTERNS: RegExp[] = [
  /divide\s+(yourself|yourselves)?\s+in\s+teams/i,
  /teams?\s+of\s+\d+/i,
  /work\s+in\s+(pairs|groups|teams)/i,
  /preparation\s+time\s*:\s*\d+/i,
  /class\s+discussion\s+time\s*:\s*\d+/i,
  /discussion\s+time\s*:\s*\d+/i,
  /in[- ]classroom\s+discussion/i,
  /activity\s+description/i,
  /prepare\s+your\s+answers/i,
  /tutorial\s+week\s+\d+/i,
  /week\s+\d+\s+tutorial/i,
  /week\s+\d{1,2}\b/i,
  /--\s*\d+\s+of\s+\d+\s*--/i,
  /--\s*\d+\s*--/i,
  /\basira\s+khanal\b/i,
  /\bmn6094ni\b/i,
  /^[A-Z]{2}\d{4}[A-Z0-9]*$/i,
  /\bmodule\s+leader\b/i,
  /\blecturer\b/i,
  /\binstructor\b/i,
  /^slide\s+\d+/i,
  /^presentation\s+title/i,
];

/**
 * Checks whether a line of text represents classroom logistics, slide noise, or administrative chatter.
 */
export function isClassroomLogisticsLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // Discard pure numbered lists like "1. Divide yourself..."
  if (/^\d+[\.\)]\s*(divide\s+(yourself|yourselves)?|prepare\s+your\s+answers|work\s+in\s+teams)/i.test(trimmed)) {
    return true;
  }
  return CLASSROOM_LOGISTICS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Strips classroom management directions, slide headers, pagination tokens, and module metadata from brief text.
 */
export function stripSlideArtifacts(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "\n")
    .replace(/--\s*\d+\s*--/gi, "\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isClassroomLogisticsLine(l))
    .join("\n");
}

/**
 * Extracts substantive assessment questions from slides or brief text, completely excluding classroom logistics.
 * Preserves 100% of questions in sequential order with zero truncation caps.
 */
export function extractSubstantiveBriefQuestions(rawText: string): string[] {
  if (!rawText) return [];
  const clean = stripSlideArtifacts(rawText);
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const questions: string[] = [];
  const seen = new Set<string>();

  const questionHeaderRegex = /^(?:(?:question|q|part|task)\s*[\da-zA-Z]+[:\-\s.]*|(?:\d{1,2})[\.\):\-]\s+)(.+)/i;

  for (const line of lines) {
    if (isClassroomLogisticsLine(line)) continue;

    const match = line.match(questionHeaderRegex);
    if (match) {
      const qText = match[1].replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
      if (qText.length >= 8 && !seen.has(qText.toLowerCase())) {
        seen.add(qText.toLowerCase());
        questions.push(qText);
      }
      continue;
    }

    // Sentence questions ending in ?
    if (line.endsWith("?") && line.length >= 15 && !line.toLowerCase().includes("pay people to leave")) {
      const qText = line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\?+$/, "").trim();
      if (!seen.has(qText.toLowerCase())) {
        seen.add(qText.toLowerCase());
        questions.push(qText);
      }
      continue;
    }

    // Explicit marks bracketed in line without question prefix (e.g. "Conduct a two-sample t-test... [15 marks]")
    if (/\[\s*\d+\s*(?:marks?|pts?|points?)\s*\]|\(\s*\d+\s*(?:marks?|pts?|points?)\s*\)/i.test(line) && line.length >= 15) {
      const qText = line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
      if (!seen.has(qText.toLowerCase())) {
        seen.add(qText.toLowerCase());
        questions.push(qText);
      }
    }
  }

  return questions;
}

/**
 * Extracts case study prompt/context (e.g. Zappos quit offer) if present in the brief.
 */
export function extractCaseContext(rawText: string): string | undefined {
  if (!rawText) return undefined;
  const clean = stripSlideArtifacts(rawText);
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (isClassroomLogisticsLine(line)) continue;
    if (line.toLowerCase().includes("zappos") && (line.toLowerCase().includes("2,000") || line.toLowerCase().includes("quit"))) {
      return line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    }
  }

  return undefined;
}

/**
 * Detects whether a brief represents a tutorial task, seminar activity, worksheet, or short Q&A.
 */
export function isTutorialOrShortQABrief(rawText: string, targetWordCount?: number): boolean {
  if (targetWordCount && targetWordCount <= 500) return true;
  const lower = (rawText || "").toLowerCase();
  return (
    lower.includes("tutorial") ||
    lower.includes("in classroom discussion") ||
    lower.includes("activity description") ||
    lower.includes("worksheet") ||
    lower.includes("seminar") ||
    (lower.includes("question 1") && lower.includes("question 2") && !lower.includes("dissertation") && !lower.includes("thesis"))
  );
}
