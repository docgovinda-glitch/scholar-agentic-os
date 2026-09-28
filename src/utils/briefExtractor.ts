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

  const seen = new WeakSet();

  function sanitize(val: any): any {
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

    if (seen.has(val)) {
      return "[Circular]";
    }
    seen.add(val);

    if (Array.isArray(val)) {
      return val.map((item) => sanitize(item)).filter((item) => item !== undefined);
    }

    const cleanObj: Record<string, any> = {};
    for (const [key, item] of Object.entries(val)) {
      // Omit DOM/React internal attributes like _reactFiber, _reactEvents
      if (key.startsWith("_react") || key === "nativeEvent") {
        continue;
      }
      const cleaned = sanitize(item);
      if (cleaned !== undefined) {
        cleanObj[key] = cleaned;
      }
    }
    return cleanObj;
  }

  return sanitize(input);
}

/**
 * Deep equality comparator for state guards.
 * Prevents unnecessary re-render cycles and cascading updates.
 */
export function isDeepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isDeepEqual(a[key], b[key])) return false;
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
