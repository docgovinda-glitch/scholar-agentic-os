/**
 * Robust JSON parser for LLM responses.
 *
 * Handles:
 * 1. Direct JSON objects/arrays.
 * 2. Markdown fenced code blocks (```json ... ``` or ``` ... ```).
 * 3. Raw outer braces/brackets ({...} or [...]).
 */
export function parseJsonFromLlm(content: any): any {
  if (!content) return null;
  if (typeof content !== "string") return content;
  const raw = content.trim();

  // 1. Try direct parse
  try {
    return JSON.parse(raw);
  } catch (_) {}

  // 2. Try stripping markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // 3. Try finding outer brackets / braces: {...} or [...]
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(raw.slice(firstBracket, lastBracket + 1));
    } catch (_) {}
  }

  return null;
}
