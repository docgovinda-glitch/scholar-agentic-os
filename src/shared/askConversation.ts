/**
 * Conversation memory for Ask Scholar, shared by the server (`/api/ai/agent`) and the browser's
 * own-key fallback, so a follow-up sees the earlier turns on every path.
 *
 * Budget: the last RECENT_TURNS messages are sent nearly in full; older ones (up to MAX_TURNS in
 * all) are cut to a short line. Reference lists are stripped from earlier answers: the model needs
 * what was said, not the bibliography again, and those lists were the largest part of the history.
 */

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

export const MAX_TURNS = 8;
export const RECENT_TURNS = 4;
const RECENT_CHARS = 1800;
const OLDER_CHARS = 280;

const REFERENCES_HEADING = /\n#{1,6}\s*(?:references|reference list|bibliography|sources|works cited)\b[\s\S]*$/i;

/** An earlier answer without its trailing reference list. */
export function stripReferenceList(text: string): string {
  return text.replace(REFERENCES_HEADING, "").trimEnd();
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+\n/g, "\n").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return `${(lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut).trimEnd()} …`;
}

/** Keeps only well-formed turns with text, newest last, at most MAX_TURNS. */
export function normalizeAskHistory(raw: unknown): AskTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: AskTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const role = r.role === "user" || r.role === "assistant" ? r.role : null;
    const content = typeof r.content === "string" ? r.content.trim() : "";
    if (role && content) turns.push({ role, content });
  }
  return turns.slice(-MAX_TURNS);
}

/** The earlier conversation as a prompt block, or "" when there is none. */
export function buildConversationContext(history: AskTurn[]): string {
  const turns = history.slice(-MAX_TURNS);
  if (turns.length === 0) return "";
  const firstRecent = Math.max(0, turns.length - RECENT_TURNS);
  const lines = turns.map((t, i) => {
    const body = t.role === "assistant" ? stripReferenceList(t.content) : t.content;
    const text = clip(body, i >= firstRecent ? RECENT_CHARS : OLDER_CHARS);
    return `${t.role === "user" ? "User" : "Scholar Core"}: ${text}`;
  });
  return `Prior Conversation Context (earlier turns shortened, reference lists omitted):\n${lines.join("\n")}\n`;
}

/** The question with the conversation before it, for paths that send one prompt string. */
export function withConversation(question: string, history: AskTurn[]): string {
  const context = buildConversationContext(history);
  return context ? `${context}\nUser Inquiry: ${question}` : question;
}
