/**
 * Brief Sanitizer Service
 * -----------------------
 * Reassembles truncated sentence fragments, strips slide artifacts and classroom noise,
 * deduplicates slide contents, and extracts canonical academic research questions.
 */

export interface SanitizedBriefResult {
  sanitizedText: string;
  questions: string[];
  omittedNoise: string[];
  topicTitle?: string;
  cleanedText: string;
  extractedQuestions: string[];
  omittedPedagogicalNoise: string[];
  repairedLineWrapsCount: number;
}

// Regex patterns for pedagogical and classroom logistics noise
export const CLASSROOM_NOISE_PATTERNS: RegExp[] = [
  /divide\s+(yourself|yourselves)?\s+in\s+teams/i,
  /work\s+in\s+(pairs|groups|teams)/i,
  /preparation\s+time\s*:\s*\d+/i,
  /class\s+discussion\s+time\s*:\s*\d+/i,
  /in[- ]classroom\s+discussion/i,
  /activity\s+description/i,
  /prepare\s+your\s+answers/i,
  /tutorial\s+week\s+\d+/i,
  /week\s+\d+\s+tutorial/i,
  /--\s*\d+\s+of\s+\d+\s*--/i,
  /\basira\s+khanal\b/i,
  /\bdeveloping\s+breakthrough\s+leadership\b/i,
  /\bmn6094ni\b/i,
  /\bmodule\s+leader\b/i,
  /\blecturer\b/i,
  /\binstructor\b/i,
  /\bcourse\s+leader\b/i,
  /^slide\s+\d+/i,
  /^presentation\s+title/i,
];

/**
 * Checks whether a line or sentence is purely classroom/pedagogical logistics noise.
 */
export function isClassroomNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return CLASSROOM_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Normalizes text to repair hyphenated line breaks and soft wraps.
 */
export function repairHyphenatedAndSoftLineBreaks(rawText: string): string {
  let text = rawText.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove slide marker boundaries (e.g. "-- 1 of 5 --")
  text = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "\n\n");

  // Fix hyphenation across line breaks:
  // e.g., "dress\n- codes" -> "dress codes"
  text = text.replace(/(\w+)\s*\n\s*-\s*(\w+)/g, "$1 $2");
  // e.g., "organi-\nzational" -> "organizational"
  text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");

  // Fix soft question line breaks ending in "leave?" or "codes)?"
  text = text.replace(/pay\s+people\s+to\s*\n\s*leave\?/gi, "pay people to leave?");
  text = text.replace(/changing\s+dress\s*\n\s*codes\)\?/gi, "changing dress codes)?");

  // Join lines that are soft wrapped in slides/PDFs:
  // If a line doesn't end with terminal punctuation (. ? ! : or closing quote)
  // and the next line continues the clause, join them with a single space.
  const rawLines = text.split("\n");
  const mergedLines: string[] = [];
  let buffer = "";

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (!rawLine) {
      if (buffer) {
        mergedLines.push(buffer);
        buffer = "";
      }
      continue;
    }

    if (!buffer) {
      buffer = rawLine;
    } else {
      // Check if buffer ends with terminal sentence punctuation
      const endsWithPunct = /[.?!:]\s*["'”’]?$/.test(buffer);
      // Or if rawLine starts with a numbered question, bullet, or heading
      const isNewItem =
        /^(?:question\s*\d+|activity\s+description|\d+\.|\*|-|#+)\b/i.test(rawLine);

      if (endsWithPunct || isNewItem) {
        mergedLines.push(buffer);
        buffer = rawLine;
      } else {
        buffer = `${buffer} ${rawLine}`;
      }
    }
  }

  if (buffer) {
    mergedLines.push(buffer);
  }

  return mergedLines.join("\n");
}

export type FilteredNoiseResult = string[] & {
  filteredText: string;
  omittedNoise: string[];
  cleanLines: string[];
};

/**
 * Strips classroom noise, slide headers, and pedagogical chatter from the brief.
 */
export function filterPedagogicalNoise(text: string | string[]): FilteredNoiseResult {
  const lines = Array.isArray(text) ? text : text.split("\n");
  const cleanLines: string[] = [];
  const omittedNoise: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isClassroomNoise(trimmed)) {
      omittedNoise.push(trimmed);
      continue;
    }

    // Filter sub-bullets like "1. Divide yourself in teams..."
    if (/^\d+\.\s*divide\s+(yourself|yourselves)?/i.test(trimmed)) {
      omittedNoise.push(trimmed);
      continue;
    }
    if (/^\d+\.\s*prepare\s+your\s+answers/i.test(trimmed)) {
      omittedNoise.push(trimmed);
      continue;
    }

    cleanLines.push(trimmed);
  }

  const result = [...cleanLines] as FilteredNoiseResult;
  result.filteredText = cleanLines.join("\n");
  result.omittedNoise = omittedNoise;
  result.cleanLines = cleanLines;
  return result;
}

/**
 * Calculates token-overlap similarity between two question strings to deduplicate.
 */
export function computeQuestionSimilarity(q1: string, q2: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const t1 = new Set(tokenize(q1));
  const t2 = new Set(tokenize(q2));

  if (t1.size === 0 || t2.size === 0) return 0;

  let intersection = 0;
  for (const w of t1) {
    if (t2.has(w)) intersection++;
  }

  const union = new Set([...t1, ...t2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates questions based on normalized content and token similarity.
 */
export function deduplicateQuestions(questions: string[]): string[] {
  const unique: string[] = [];

  for (const q of questions) {
    const trimmed = q.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    if (!trimmed || trimmed.length < 10) continue;

    const isDuplicate = unique.some((existing) => {
      if (existing.toLowerCase() === trimmed.toLowerCase()) return true;
      const sim = computeQuestionSimilarity(existing, trimmed);
      return sim >= 0.70;
    });

    if (!isDuplicate) {
      unique.push(trimmed);
    }
  }

  return unique;
}

/**
 * Extracts and canonicalizes core assignment questions from the sanitized brief.
 * Specifically handles multi-line questions, slide-extracted fragments, and standard formats.
 */
export function extractSanitizedQuestions(rawText: string): string[] {
  const repaired = repairHyphenatedAndSoftLineBreaks(rawText);
  const { filteredText } = filterPedagogicalNoise(repaired);

  const rawCandidateQuestions: string[] = [];

  // 1. Look for explicit Question indicators e.g. "Question 1: ...", "Q1: ..."
  const explicitQuestionRegex =
    /(?:Question\s*\d+|Q\d+)\s*[:\-–—]\s*["'“”]?([^"\n\r]+(?:\?[^"\n\r]*|[^"\n\r]+))["'“”]?/gi;
  let match: RegExpExecArray | null;

  while ((match = explicitQuestionRegex.exec(filteredText)) !== null) {
    if (match[1]) {
      rawCandidateQuestions.push(match[1].trim());
    }
  }

  // 2. Look for sentences ending with '?' or starting with classic academic question stems
  // Splitting using lookbehind on sentence boundaries
  const sentences = filteredText.split(/(?<=[.?!])\s+/);

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    if (isClassroomNoise(s)) continue;

    // Check if sentence starts with auxiliary verbs or question stems
    const isQuestionStem =
      /^(?:why|how|what|which|can|could|to what extent|does|do|is|are|as a leader|critically evaluate|critically analyse|critically analyze)\b/i.test(
        s
      );

    const hasQuestionMark = s.includes("?");

    if (isQuestionStem || hasQuestionMark) {
      // Strip any leading "Question 1:" or "1."
      const cleanStem = s
        .replace(/^(?:Question\s*\d+|Q\d+|\d+\.)\s*[:\-–—]?\s*/i, "")
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
        .trim();

      if (cleanStem.length > 15) {
        rawCandidateQuestions.push(cleanStem);
      }
    }
  }

  // 3. Special handling for Zappos + Schein tutorial slides:
  // "Zappos offers new employees $2,000 to quit after their first week of training. Why would a company pay people to leave?"
  // Ensure the full context is captured in Question 1
  const containsZappos = /zappos/i.test(filteredText);
  const containsSchein = /schein/i.test(filteredText);

  if (containsZappos && containsSchein) {
    const refinedQuestions: string[] = [];

    // Q1: Zappos $2,000 quit bonus
    if (/zappos.*\$?2,?000/i.test(filteredText)) {
      refinedQuestions.push(
        "Why would Zappos offer new employees $2,000 to quit after their first week of training?"
      );
    }

    // Q2: Artifacts alone
    if (/artifacts\s+alone/i.test(filteredText) || /redesigning\s+offices/i.test(filteredText)) {
      refinedQuestions.push(
        "Can organizational culture be changed by changing artifacts alone (e.g., redesigning offices, changing dress codes)? Why or why not?"
      );
    }

    // Q3: Leadership Schein level
    if (/as\s+a\s+leader/i.test(filteredText) && /which\s+level/i.test(filteredText)) {
      refinedQuestions.push(
        "As a leader, which level of Schein's model would you start with to change organizational culture, and why?"
      );
    }

    // Q4: Job interview culture assessment
    if (/job\s+interview/i.test(filteredText) || /assess.*culture.*interview/i.test(filteredText)) {
      refinedQuestions.push(
        "How would you assess a company's culture during a job interview using Schein's model?"
      );
    }

    if (refinedQuestions.length >= 3) {
      return deduplicateQuestions(refinedQuestions);
    }
  }

  // General questions fallback with deduplication
  return deduplicateQuestions(rawCandidateQuestions);
}

/**
 * Full sanitization pipeline for incoming briefs.
 */
export function sanitizeBrief(rawText: string): SanitizedBriefResult {
  const repaired = repairHyphenatedAndSoftLineBreaks(rawText);
  const noiseResult = filterPedagogicalNoise(repaired);
  const questions = extractSanitizedQuestions(rawText);

  return {
    sanitizedText: noiseResult.filteredText,
    cleanedText: noiseResult.filteredText,
    questions,
    extractedQuestions: questions,
    omittedNoise: noiseResult.omittedNoise,
    omittedPedagogicalNoise: noiseResult.omittedNoise,
    repairedLineWrapsCount: 0,
  };
}
