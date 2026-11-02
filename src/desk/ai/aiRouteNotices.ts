/**
 * Tells the user how an AI step was answered when something other than the
 * first choice happened: a switch to another model, a skipped connection, an
 * answer shortened to fit the context. A clean first-choice answer shows
 * nothing. Text comes from the server's `aiRoute` summary as is.
 */
import { showAppToast, type ToastVariant } from "../../components/ui/FeedbackSystem";

export interface AiRouteSummary {
  answeredBy?: { label: string; lane: "premium" | "byok" | "local" };
  notices: Array<{ kind: "fallback" | "retry" | "skipped" | "limit"; text: string }>;
  usage?: { inputTokens: number; outputTokens: number };
}

/** The toast for a summary, or null when there is nothing worth saying. */
export function describeAiRoute(summary: AiRouteSummary): { message: string; variant: ToastVariant } | null {
  const notable = summary.notices.filter((n) => n.kind !== "retry");
  if (notable.length === 0) return null;
  const lines = notable.slice(0, 3).map((n) => n.text);
  if (notable.length > 3) lines.push(`${notable.length - 3} more`);
  const by = summary.answeredBy ? `Answered by ${summary.answeredBy.label}. ` : "";
  return { message: `${by}${lines.join(" · ")}`, variant: "warning" };
}

const recent = new Map<string, number>();
const DEDUPE_MS = 10_000;

export function reportAiRoute(summary: AiRouteSummary, now = Date.now(), show = showAppToast): void {
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
