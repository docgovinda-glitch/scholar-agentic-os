import type { Candidate, ChatMessage, RouteRequest } from "./types";

/**
 * Token preflight. A pluggable exact counter (provider tokenizer or count-tokens
 * endpoint) is preferred; the fallback estimate is deliberately conservative
 * (3.2 chars/token plus a 10% margin) so we refuse early rather than overflow late.
 */
export type TokenCounter = (messages: ChatMessage[], c: Candidate) => number;

const IMAGE_TOKENS = 1600; // conservative per-image allowance

export const estimateTokens: TokenCounter = (messages) => {
  let chars = 0;
  let images = 0;
  for (const m of messages) {
    chars += 8; // role/framing overhead
    if (typeof m.content === "string") chars += m.content.length;
    else for (const p of m.content) p.type === "text" ? (chars += p.text.length) : images++;
  }
  return Math.ceil((chars / 3.2) * 1.1) + images * IMAGE_TOKENS;
};

export interface Preflight {
  fits: boolean;
  promptTokens: number;
  /** Output tokens this candidate can actually produce for this prompt. */
  outputBudget: number;
  usedRatio: number;
  warn: boolean;
}

export function preflight(req: RouteRequest, c: Candidate, count: TokenCounter, warnAt = 0.8): Preflight {
  const promptTokens = count(req.messages, c) + (req.tools ? JSON.stringify(req.tools).length / 3 : 0);
  const room = c.contextWindow - promptTokens;
  const outputBudget = Math.max(0, Math.min(req.desiredOutputTokens, c.maxOutputTokens, room));
  const usedRatio = (promptTokens + outputBudget) / c.contextWindow;
  return {
    fits: outputBudget >= req.minOutputTokens,
    promptTokens: Math.ceil(promptTokens),
    outputBudget,
    usedRatio,
    warn: usedRatio >= warnAt || outputBudget < req.desiredOutputTokens,
  };
}
