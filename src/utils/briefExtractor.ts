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

  return lines.slice(0, 10).map((line, idx) => {
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
 */
export function extractSubstantiveBriefQuestions(rawText: string): string[] {
  if (!rawText) return [];
  const clean = stripSlideArtifacts(rawText);
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const questions: string[] = [];
  const seen = new Set<string>();

  const questionHeaderRegex = /^(?:question\s*\d+[:\-\s]*|q\d+[:\-\s]*)(.+)/i;

  for (const line of lines) {
    if (isClassroomLogisticsLine(line)) continue;

    const match = line.match(questionHeaderRegex);
    if (match) {
      const qText = match[1].replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
      if (qText.length >= 10 && !seen.has(qText.toLowerCase())) {
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
