/**
 * Tells the user how an AI step was answered when something other than the
 * first choice happened: a switch to another model, a skipped connection, an
 * answer shortened to fit the context. A clean first-choice answer shows
 * nothing. Text comes from the server's `aiRoute` summary as is.
 */
import { lastAiAnswer } from "./liveAiStatus";
import { showAppToast, type ToastVariant } from "../../components/ui/FeedbackSystem";

export interface AiRouteSummary {
  answeredBy?: { label: string; lane: "byok" | "local" };
  notices: Array<{ kind: "fallback" | "retry" | "skipped" | "limit"; text: string }>;
  usage?: { inputTokens: number; outputTokens: number };
}

/** The toast for a summary, or null when there is nothing worth saying. */
export function describeAiRoute(summary: AiRouteSummary): { message: string; variant: ToastVariant } | null {
  const notable = summary.notices.filter((n) => n.kind !== "retry");
  if (notable.length === 0) return null;
  // An answer arrived: say which model gave it, briefly. Switching between models is the router
  // doing its job, not a problem, so it is not listed model by model (that read as an error).
  if (summary.answeredBy) {
    // A model paused or switched away from is routine; a skipped connection for any other reason
    // (a blocked address, a missing key) is something the person should fix, so it is kept as is.
    const routine = (n: { kind: string; text: string }) => n.kind === "fallback" || (n.kind === "skipped" && /retrying in|paused|limit|busy|quota/i.test(n.text));
    const switched = notable.filter(routine).length;
    const other = notable.filter((n) => !routine(n));
    const parts = [`Answered by ${summary.answeredBy.label}.`];
    if (switched) parts.push(switched === 1 ? "Another model did not answer, so it moved on." : `${switched} other models did not answer, so it moved on.`);
    for (const n of other.slice(0, 2)) parts.push(/[.!?]$/.test(n.text) ? n.text : `${n.text}.`);
    return { message: parts.join(" "), variant: other.length ? "warning" : "info" };
  }
  const lines = notable.slice(0, 3).map((n) => n.text);
  if (notable.length > 3) lines.push(`${notable.length - 3} more`);
  return { message: lines.join(" · "), variant: "warning" };
}

const recent = new Map<string, number>();
const DEDUPE_MS = 10_000;

export function reportAiRoute(summary: AiRouteSummary, now = Date.now(), show = showAppToast): void {
  if (summary.answeredBy) lastAiAnswer.record(summary.answeredBy.label, summary.answeredBy.lane, summary.notices.some((n) => n.kind === "fallback"));
  const t = describeAiRoute(summary);
  if (!t) return;
  const last = recent.get(t.message);
  if (last !== undefined && now - last < DEDUPE_MS) return;
  recent.set(t.message, now);
  if (recent.size > 50) recent.delete(recent.keys().next().value as string);
  show(t.message, t.variant, 7000);
}

/** Reads `aiRoute` from a JSON AI response without consuming it. */
export function inspectAiResponse(res: Response): void {
  // Purely informational: nothing here may break or delay the request.
  try {
    if (!(res.headers?.get?.("content-type") ?? "").includes("application/json")) return;
    res.clone().json()
      .then((body: unknown) => {
        const s = (body as { aiRoute?: AiRouteSummary } | null)?.aiRoute;
        if (s && Array.isArray(s.notices)) reportAiRoute(s);
      })
      .catch(() => undefined);
  } catch {
    // Not a standard Response; nothing to report.
  }
}
