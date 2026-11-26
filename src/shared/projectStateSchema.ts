/**
 * Typed Project State Schema and Safe Answer Field Accessor
 * 
 * Provides robust decoding for persisted answers payloads across client and server.
 * Replaces crash-prone raw JSON parsing of answers payloads with resilient fallback parsing.
 */

import { parseAndRepairLLMJson } from "./llmJsonParser";

/**
 * Safely parses an answer field of any type into type T, falling back to a provided default.
 * Handles:
 * 1. Pre-parsed objects/arrays (returned directly)
 * 2. JSON strings (with AST repair for malformed quotes, trailing commas, and LLM reasoning blocks)
 * 3. Null/undefined/empty string values (gracefully returns fallback)
 */
export function safeParseAnswerField<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  // Already parsed object/array
  if (typeof raw !== "string") {
    return raw as T;
  }

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
    return fallback;
  }

  try {
    return parseAndRepairLLMJson<T>(trimmed, fallback);
  } catch {
    return fallback;
  }
}
