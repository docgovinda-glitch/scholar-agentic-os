/**
 * AI for the Journal Writer's older pipeline (manuscript sections, coherence
 * check, peer review, cover letter, anonymisation, journal requirements).
 * Those functions (src/app/*) call the platform gateway with one provider, key
 * and model. This runs them over the same connections every other workspace
 * uses, so AI Access works here too:
 *
 *   - the connection the screen chose (legacy `provider`/`apiKey`/`model` in the
 *     body) goes first, then every connection in the request's `x-ai-keyring` /
 *     `x-ai-*` headers, in the person's order;
 *   - each connection's model is resolved from the provider's live list (a
 *     retired or unnamed model is replaced) with up to two live alternates;
 *   - a failure moves to the next candidate; a privacy verdict (GatewayDenied)
 *     never does, because it is an answer, not an outage;
 *   - an account-wide failure (key, credit) skips the rest of that connection.
 */
import type { Request } from "express";
import { GatewayDenied } from "../../../src/platform/gateway/types.ts";
import { getCloudProvider } from "../../../src/config/providerCatalog.ts";
import type { TaskClass } from "../../../src/platform/router/types.ts";
import { keyringToCandidates, type KeyringEntry } from "../../routes/aiRun.ts";
import { screenCandidates } from "./aiEndpointGuard.ts";
import { entryFromCatalog, expandKeyring, quarantineModel } from "./liveModels.ts";
import { NoAiConnectedError, requestKeyring } from "./routerBridge.ts";

export interface StudioAi { provider: string; apiKey: string; model?: string; label: string }
export interface ExplicitAi { provider?: unknown; apiKey?: unknown; model?: unknown }

/** Gateway provider ids are catalog ids; the router's native names map back. */
const CATALOG_ID: Record<string, string> = { google: "gemini", anthropic: "claude" };
const MAX_ATTEMPTS = 6;

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown; httpStatus?: unknown })?.status ?? (e as { httpStatus?: unknown })?.httpStatus;
  return typeof s === "number" ? s : undefined;
};
const accountWide = (e: unknown) => {
  const s = statusOf(e);
  return s === 401 || s === 402 || s === 403 || /invalid api key|incorrect api key|insufficient|quota|billing|credit/i.test(e instanceof Error ? e.message : "");
};
const modelGone = (e: unknown) => statusOf(e) === 404 || /model.{0,60}(not found|does not exist|decommission|no longer)/i.test(e instanceof Error ? e.message : "");

/** The connections to try, in order. Empty when no AI is connected. */
export async function studioCandidates(req: Request, task: TaskClass, explicit?: ExplicitAi) {
  const entries: KeyringEntry[] = [];
  if (typeof explicit?.provider === "string" && typeof explicit.apiKey === "string" && explicit.apiKey) {
    const made = entryFromCatalog(explicit.provider, { apiKey: explicit.apiKey, model: typeof explicit.model === "string" ? explicit.model : undefined });
    if (made.ok) entries.push(made.entry);
  }
  for (const e of await requestKeyring(req as never)) {
    if (!entries.some((x) => (x.via ?? x.provider) === (e.via ?? e.provider) && x.apiKey === e.apiKey)) entries.push(e);
  }
  const expanded = await expandKeyring(entries, task);
  const offered = keyringToCandidates(expanded.entries);
  // A connection the screen chose explicitly is never dropped just because its model list could not be
  // fetched: it runs with the gateway's own default model, the last resort, after the live candidates.
  const first = entries[0];
  if (first && explicit && !offered.some((c) => c.group === (first.via ?? first.provider))) offered.push(...keyringToCandidates([{ ...first, model: "" }]));
  const { kept } = await screenCandidates(offered);
  // The gateway runs cloud providers only, and cannot take a custom address.
  const usable = kept.filter((c) => c.lane === "byok" && c.credential?.apiKey && !getCloudProvider(CATALOG_ID[c.group ?? ""] ?? c.group ?? "")?.requiresCustomBaseUrl);
  return { candidates: usable, notices: expanded.notices };
}

/** Runs `run` with the first connection that works, trying the next on failure. */
export async function runWithUserAi<T>(req: Request, opts: { task: TaskClass; explicit?: ExplicitAi }, run: (ai: StudioAi) => Promise<T>): Promise<T> {
  const { candidates, notices } = await studioCandidates(req, opts.task, opts.explicit);
  if (!candidates.length) {
    if (notices.length) throw new Error(notices.map((n) => n.text).join(" "));
    throw new NoAiConnectedError();
  }
  const deadGroups = new Set<string>();
  let last: unknown;
  let attempts = 0;
  for (const c of candidates) {
    if (attempts >= MAX_ATTEMPTS) break;
    const group = c.group ?? c.provider;
    if (deadGroups.has(group)) continue;
    attempts++;
    try {
      return await run({ provider: CATALOG_ID[group] ?? group, apiKey: c.credential!.apiKey!, model: c.model || undefined, label: c.label });
    } catch (err) {
      if (err instanceof GatewayDenied) throw err;
      last = err;
      if (modelGone(err)) quarantineModel(c);
      else if (accountWide(err)) deadGroups.add(group);
    }
  }
  throw last instanceof Error ? last : new Error("No connected AI could answer.");
}

export { NoAiConnectedError };
