/**
 * One plain sentence for an AI failure, from the provider's raw message.
 *
 * Providers answer with long technical text (URLs, metric names, "limit: 0").
 * Shown as is it buries what the person can do. This keeps the cause and the
 * next step; the raw text stays available behind a "Details" toggle.
 */
export interface AiFailureSummary {
  /** What happened and what to do, in one or two short sentences. */
  message: string;
  /** The provider's own text, for the details toggle (empty when it adds nothing). */
  detail: string;
  /** True when the cause was recognised and `message` already says what to do. */
  known: boolean;
}

const QUOTA = /quota|rate[\s-]?limit|too many requests|\b429\b|resource[_\s]?exhausted|insufficient credits|\b402\b/i;
const BUSY = /high demand|overloaded|temporarily unavailable|service unavailable|\b503\b|\b529\b|try again later/i;
const AUTH = /api key not valid|invalid api key|unauthori[sz]ed|\b401\b|\b403\b|permission denied|rejected (this|the) key/i;
const TIMEOUT = /timed? ?out|timeout|took too long/i;

export function summariseAiFailure(raw: string | null | undefined): AiFailureSummary {
  const text = (raw ?? "").trim();
  if (!text) return { message: "Your AI did not answer. Try again in a moment.", detail: "", known: false };
  if (QUOTA.test(text)) {
    return {
      message:
        "Your AI hit its usage limit. Free tiers allow only a few requests a minute: wait a minute and try again, or choose another model in AI Access.",
      detail: text,
      known: true,
    };
  }
  if (BUSY.test(text)) return { message: "Your AI's model is busy right now. Try again in a moment.", detail: text, known: true };
  if (AUTH.test(text)) return { message: "Your AI rejected its key. Check the key in AI Access.", detail: text, known: true };
  if (TIMEOUT.test(text)) return { message: "Your AI took too long to answer. Try again.", detail: text, known: true };
  // Unknown: the first sentence, kept short; the rest goes to the details.
  const first = text.split(/(?<=[.!?])\s/)[0].replace(/^All connected AI models failed\.\s*/i, "");
  const short = first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
  return { message: short || "Your AI did not answer. Try again.", detail: short === text ? "" : text, known: false };
}
