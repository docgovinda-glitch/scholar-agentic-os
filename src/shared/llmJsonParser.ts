/**
 * Resilient AST JSON Parser & Repair Engine
 *
 * Designed specifically for LLM outputs:
 * 1. Strips `<think>...</think>` or `<thought>...</thought>` reasoning blocks.
 * 2. Strips markdown code fences (```json ... ```).
 * 3. Walks characters with a string-aware bracket state machine to isolate outermost valid `{...}` or `[...]`.
 * 4. Repairs trailing commas before `}` or `]`.
 * 5. Sanitizes unescaped raw control characters (newlines, carriage returns, tabs) inside string literals.
 * 6. Supports graceful fallback values for bulletproof resilience.
 */

export function stripReasoningBlocks(text: string): string {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .trim();
}

export function stripCodeFences(text: string): string {
  if (!text) return "";
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}

/**
 * Extracts outermost balanced JSON substring ({...} or [...]) using a string-aware state machine.
 */
export function extractOutermostJsonSubstring(text: string): string | null {
  if (!text) return null;

  let startIdx = -1;
  let targetClose = "";
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === "\\") {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (startIdx === -1) {
      if (ch === "{") {
        startIdx = i;
        targetClose = "}";
        depth = 1;
      } else if (ch === "[") {
        startIdx = i;
        targetClose = "]";
        depth = 1;
      }
    } else {
      if ((targetClose === "}" && ch === "{") || (targetClose === "]" && ch === "[")) {
        depth++;
      } else if (ch === targetClose) {
        depth--;
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
  }

  return startIdx !== -1 ? text.slice(startIdx) : null;
}

/**
 * Repairs trailing commas and escapes invalid raw control characters inside string literals.
 */
export function repairJsonSyntax(jsonStr: string): string {
  if (!jsonStr) return "";

  // 1. Remove trailing commas before object or array closes
  let repaired = jsonStr.replace(/,\s*([}\]])/g, "$1");

  // 2. Escape raw unescaped newlines and control characters inside double-quoted string literals
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        result += ch;
      } else if (ch === "\\") {
        isEscaped = true;
        result += ch;
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === "\n") {
        result += "\\n";
      } else if (ch === "\r") {
        result += "\\r";
      } else if (ch === "\t") {
        result += "\\t";
      } else if (ch.charCodeAt(0) < 32) {
        // Unicode escape for raw control characters
        result += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
    }
  }

  // If a string literal was left unclosed at the end of input, close it
  if (inString) {
    result += '"';
  }

  // 3. Remove trailing commas again if closing quotes revealed them
  result = result.replace(/,\s*([}\]])/g, "$1");

  return result;
}

/**
 * Parses and repairs raw LLM text into typed JSON.
 *
 * @param rawText Raw response text from the LLM
 * @param fallback Optional fallback value returned if all parsing attempts fail
 */
export function parseAndRepairLLMJson<T>(rawText: string, fallback?: T): T {
  if (!rawText || typeof rawText !== "string") {
    if (fallback !== undefined) return fallback;
    throw new Error("Cannot parse empty or non-string LLM output as JSON");
  }

  // Step 1: Strip thinking blocks
  const withoutReasoning = stripReasoningBlocks(rawText);

  // Step 2: Strip code fences
  const withoutFences = stripCodeFences(withoutReasoning);

  // Step 3: Extract outermost JSON substring
  const candidate = extractOutermostJsonSubstring(withoutFences) || withoutFences;

  // Step 4: Try direct parse
  try {
    return JSON.parse(candidate) as T;
  } catch (_) {
    // Continue to repair
  }

  // Step 5: Try parse after syntactic repair
  const repaired = repairJsonSyntax(candidate);
  try {
    return JSON.parse(repaired) as T;
  } catch (_) {
    // Continue to permissive quote repair
  }

  // Step 6: Permissive single-quote repair (if Python dict style was emitted)
  try {
    const singleQuoteRepaired = repaired
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      .replace(/\bNone\b/g, "null")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false");
    return JSON.parse(singleQuoteRepaired) as T;
  } catch (_) {
    // Fall back or throw
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Failed to parse LLM JSON: ${rawText.slice(0, 150)}...`);
}
