/**
 * Resilient LLM JSON Parser and Schema Repair Pipeline
 *
 * Designed to handle small-model anomalies, reasoning model outputs,
 * and malformed JSON syntax:
 * 1. Strips `<think>...</think>` reasoning tokens (DeepSeek R1, QwQ, etc.).
 * 2. Extracts outermost balanced JSON object `{...}` or array `[...]`
 *    via character-level state machine (ignoring braces inside quotes).
 * 3. Repairs common small-model syntax faults:
 *    - Trailing commas before `}` or `]`.
 *    - Unescaped newlines/tabs inside string literals.
 *    - Markdown code fences (` ```json `).
 * 4. Passes native `response_format: { type: "json_object" }` where supported.
 * 5. Type-safe validation with zero `any` types.
 */

/**
 * Strips reasoning model thinking blocks `<think>...</think>`.
 */
export function stripReasoningBlocks(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Strips outer markdown code fences like ```json ... ``` or ``` ... ```.
 */
export function stripMarkdownFences(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();

  // Full wrap match
  const fullMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fullMatch && fullMatch[1]) {
    return fullMatch[1].trim();
  }

  // First inner fence match if surrounded by chat fluff
  const innerMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (innerMatch && innerMatch[1]) {
    return innerMatch[1].trim();
  }

  return trimmed;
}

/**
 * Extracts outermost balanced JSON object `{...}` or array `[...]`
 * using a character-level state machine that ignores braces/brackets inside strings.
 */
export function extractBalancedJson(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();

  let startIndex = -1;
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (stack.length === 0) {
        startIndex = i;
      }
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === char) {
        stack.pop();
        if (stack.length === 0 && startIndex !== -1) {
          return trimmed.slice(startIndex, i + 1);
        }
      }
    }
  }

  // If unclosed, attempt to grab from startIndex to last brace/bracket
  if (startIndex !== -1) {
    const lastBrace = trimmed.lastIndexOf("}");
    const lastBracket = trimmed.lastIndexOf("]");
    const lastClose = Math.max(lastBrace, lastBracket);
    if (lastClose > startIndex) {
      return trimmed.slice(startIndex, lastClose + 1);
    }
  }

  return trimmed;
}

/**
 * Safely escapes unescaped literal newlines and control characters inside JSON strings.
 */
export function repairUnescapedStringLiterals(jsonStr: string): string {
  if (!jsonStr || typeof jsonStr !== "string") return "";

  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (inString) {
      if (escape) {
        escape = false;
        result += char;
      } else if (char === "\\") {
        escape = true;
        result += char;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        // Drop naked carriage return
      } else if (char === "\t") {
        result += "\\t";
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }

  return result;
}

/**
 * Removes trailing commas before `}` or `]` outside of string literals.
 */
export function removeTrailingCommas(jsonStr: string): string {
  if (!jsonStr || typeof jsonStr !== "string") return "";

  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (inString) {
      result += char;
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else if (char === ",") {
        // Look ahead past whitespace to check if the next meaningful token is a closing delimiter
        let j = i + 1;
        while (j < jsonStr.length && /\s/.test(jsonStr[j])) {
          j++;
        }
        if (j < jsonStr.length && (jsonStr[j] === "}" || jsonStr[j] === "]")) {
          // Skip the trailing comma
          continue;
        }
        result += char;
      } else {
        result += char;
      }
    }
  }

  return result;
}

/**
 * Enriches provider payload with native JSON formatting where supported.
 */
export function withJsonObjectFormat(
  payload: Record<string, unknown>,
  schema?: unknown
): Record<string, unknown> {
  const enriched = { ...payload };
  if (schema) {
    enriched.response_format = {
      type: "json_object",
      response_schema: schema,
    };
  } else {
    enriched.response_format = {
      type: "json_object",
    };
  }
  return enriched;
}

export type LLMJsonValidator<T> =
  | ((val: unknown) => T)
  | { parse: (val: unknown) => T };

/**
 * Parses raw LLM output into structured data with multi-stage syntax repair
 * and optional schema validation.
 */
export function parseAndRepairLLMJson<T = unknown>(
  rawOutput: unknown,
  validator?: LLMJsonValidator<T>
): T {
  if (rawOutput === null || rawOutput === undefined) {
    throw new Error("Cannot parse null or undefined LLM output as JSON");
  }

  if (typeof rawOutput !== "string") {
    // If already parsed, validate and return
    if (validator) {
      if (typeof validator === "function") return validator(rawOutput);
      if (typeof validator === "object" && typeof validator.parse === "function") {
        return validator.parse(rawOutput);
      }
    }
    return rawOutput as T;
  }

  const raw = rawOutput.trim();

  // 1. Fast direct parse attempt
  try {
    const directParsed: unknown = JSON.parse(raw);
    if (validator) {
      if (typeof validator === "function") return validator(directParsed);
      if (typeof validator === "object" && typeof validator.parse === "function") {
        return validator.parse(directParsed);
      }
    }
    return directParsed as T;
  } catch {
    // Fall through to resilient repair pipeline
  }

  // 2. Multi-stage repair pipeline
  let candidate = stripReasoningBlocks(raw);
  candidate = stripMarkdownFences(candidate);
  candidate = extractBalancedJson(candidate);
  candidate = repairUnescapedStringLiterals(candidate);
  candidate = removeTrailingCommas(candidate);

  try {
    const repairedParsed: unknown = JSON.parse(candidate);
    if (validator) {
      if (typeof validator === "function") return validator(repairedParsed);
      if (typeof validator === "object" && typeof validator.parse === "function") {
        return validator.parse(repairedParsed);
      }
    }
    return repairedParsed as T;
  } catch (err) {
    const snippet = candidate.length > 200 ? candidate.slice(0, 200) + "..." : candidate;
    throw new Error(
      `Failed to parse repaired JSON from LLM: ${(err as Error).message}. Snippet: ${snippet}`
    );
  }
}
