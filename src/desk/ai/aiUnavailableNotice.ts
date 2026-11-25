/**
 * One app-wide signal for "no AI could answer": the server's `ai_unavailable`
 * (every provider failed or is out of quota), `ai_provider_required` (nothing
 * connected) and `ai_local_model_unreachable`. The workspace that made the
 * request still shows its own error in place; this adds the recovery action
 * (open AI Access) in one place instead of every workspace re-implementing it.
 */
export type AiUnavailableCode = "ai_unavailable" | "ai_provider_required" | "ai_local_model_unreachable";

export interface AiUnavailableNotice {
  code: AiUnavailableCode;
  message: string;
}

const CODES: ReadonlySet<string> = new Set<AiUnavailableCode>(["ai_unavailable", "ai_provider_required", "ai_local_model_unreachable"]);
/** The same failure is not announced again within this window (retries, parallel calls). */
export const AI_UNAVAILABLE_QUIET_MS = 2 * 60_000;

type Listener = (notice: AiUnavailableNotice) => void;
const listeners = new Set<Listener>();
let lastShown: { code: string; at: number } | null = null;

export function subscribeAiUnavailable(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announceAiUnavailable(notice: AiUnavailableNotice, now = Date.now()): boolean {
  if (lastShown && lastShown.code === notice.code && now - lastShown.at < AI_UNAVAILABLE_QUIET_MS) return false;
  lastShown = { code: notice.code, at: now };
  for (const l of listeners) l(notice);
  return true;
}

/** Test hook. */
export function resetAiUnavailableNotice(): void {
  lastShown = null;
}

/** Reads an AI route's failure body without consuming the response; announces the three codes above. */
export function inspectAiFailure(res: Response): void {
  if (res.ok || res.status === 426) return;
  try {
    if (!(res.headers?.get?.("content-type") ?? "").includes("application/json")) return;
    res
      .clone()
      .json()
      .then((body: unknown) => {
        const b = body as { code?: unknown; error?: unknown } | null;
        if (b && typeof b.code === "string" && CODES.has(b.code)) {
          announceAiUnavailable({ code: b.code as AiUnavailableCode, message: typeof b.error === "string" ? b.error : "" });
        }
      })
      .catch(() => undefined);
  } catch {
    // Not a standard Response; nothing to report.
  }
}
