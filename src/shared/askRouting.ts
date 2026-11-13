/**
 * One policy for how AskScholar treats a question, used by the server (`/api/ai/agent`) and the browser
 * (whether to search before answering).
 *
 * The default is to ground the answer: factual, academic, current or analytical questions get a live
 * search. Only requests that clearly need none (greetings, rewriting or translating the user's own text,
 * code, arithmetic) are answered directly. The earlier topic-word whitelist was inverted: any subject not
 * on it silently went unsearched, and plain substrings such as "now" matched inside "know".
 */

export type AskMode = "chat" | "search" | "deep-research";

const DEEP_PHRASES = [
  "deep research",
  "comprehensive research",
  "conduct detailed research",
  "investigate thoroughly",
  "systematic literature review",
  "detailed analysis of all sources",
  "cross-check claims",
  "multi-source research",
  "meta-analysis",
  "conflicting evidence",
];

const EXPLICIT_SEARCH = /\b(search the web|search online|look ?up online|web search|external sources|verify online|fact[- ]check)\b/i;

const GREETING = /^(?:hi|hello|hey|thanks|thank you|ok|okay|good (?:morning|afternoon|evening)|bye|goodbye)\b[\s!.,?]*$/i;
const OWN_TEXT_TASK = /^(?:please\s+)?(?:rewrite|rephrase|paraphrase|proofread|edit|translate|reword|shorten|expand|fix (?:the )?grammar)\b/i;
const CODE_TASK = /\b(?:write|fix|debug|refactor|explain|review)\b.{0,40}\b(?:code|function|script|regex|python|javascript|typescript|sql|bug|class)\b/i;
const ARITHMETIC = /^[\d\s+\-*/().^%=,]+$/;

const TIME_SENSITIVE = /\b(?:latest|current(?:ly)?|recent(?:ly)?|today|yesterday|tonight|this (?:week|month|year)|right now|breaking|news|election|midterm|who won|stock price|market cap|inflation rate|exchange rate)\b/i;

export function isTimeSensitiveQuery(query: string, now: Date = new Date()): boolean {
  const year = now.getFullYear();
  return TIME_SENSITIVE.test(query) || new RegExp(`\\b(?:${year - 1}|${year}|${year + 1})\\b`).test(query);
}

export function decideAskMode(input: {
  query: string;
  /** "search" | "deep-research" | "chat" | "normal" as sent by the client; anything else means "decide for me". */
  requestedMode?: string;
  hasFiles?: boolean;
  hasImages?: boolean;
  /** Vault grounding is on: the answer is written from the person's own library (an exclusive citation ledger). */
  hasVaultSources?: boolean;
}): AskMode {
  const { requestedMode } = input;
  if (requestedMode === "deep-research") return "deep-research";
  if (requestedMode === "search") return "search";
  if (requestedMode === "chat" || requestedMode === "normal") return "chat";

  const q = input.query.trim();
  const lower = q.toLowerCase();
  if (DEEP_PHRASES.some((p) => lower.includes(p))) return "deep-research";
  if (EXPLICIT_SEARCH.test(q)) return "search";

  // Attached material, or the person's own Vault, is answered from that material unless they asked to check elsewhere.
  if (input.hasFiles || input.hasImages || input.hasVaultSources) return "chat";

  if (!q || GREETING.test(q) || OWN_TEXT_TASK.test(q) || CODE_TASK.test(q) || ARITHMETIC.test(q)) return "chat";
  if (q.split(/\s+/).length <= 2 && !q.includes("?")) return "chat";
  return "search";
}
