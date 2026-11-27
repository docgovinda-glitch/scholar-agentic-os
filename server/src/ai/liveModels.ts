/**
 * Live model resolution for the user's own AI connections.
 *
 * Model line-ups change monthly, so nothing here (or anywhere on the server)
 * names a model. For each connection with a key:
 *   1. the provider's own model list is fetched live (cached; a failure is
 *      remembered briefly so a dead endpoint is not hammered);
 *   2. the model the user saved is kept only while the provider still lists it;
 *      a missing, "auto" or retired choice is replaced by the live recommendation;
 *   3. up to two other good live models of the same connection follow it (fewer
 *      for a large keyring, see `alternatesPerConnection`), so one retired,
 *      rate-limited or empty-answering model never ends the request;
 *   4. a model the provider says is gone is quarantined for a while, so the next
 *      request skips it instead of failing on it first.
 *
 * Keys are used for the request in hand; only a hash of one is ever a map key.
 */
import { createHash } from "node:crypto";
import { listModelsFor, ModelListError } from "../../../src/platform/router/modelListers.ts";
import { curateModels, type LiveModel, type ModelTier } from "../../../src/platform/router/modelCuration.ts";
import { recommendModels } from "../../../src/platform/router/modelRecommendation.ts";
import { resolveRouterTarget } from "../../../src/platform/router/providerMap.ts";
import type { Candidate, Failure, TaskClass } from "../../../src/platform/router/types.ts";
import type { KeyringEntry } from "../../routes/aiRun.ts";
import { AiEndpointBlockedError, createAiFetch } from "./aiEndpointGuard.ts";
import { connectionName, serverOutputCaps } from "./breaker.ts";
import { balanceHintKey } from "../../../src/platform/router/outputCaps.ts";

const LIST_TTL_MS = 6 * 60 * 60_000;
const FAILED_LIST_TTL_MS = 2 * 60_000;
const QUARANTINE_MS = 30 * 60_000;
const LIST_TIMEOUT_MS = 6_000;
/** Largest answer we ask a model for when the provider reports its own limit. */
const OUTPUT_CAP = 32_768;
/** A model with an unreported output limit is asked for no more than this: nearly every modern model accepts it. */
export const UNKNOWN_OUTPUT_LIMIT = 8_192;
const LOCAL = new Set(["ollama", "lmstudio", "webllm"]);
/**
 * A connection whose balance was recently refused at or below this many output tokens is "balance-limited": its
 * models are ordered lightest first, because a model that thinks before answering can spend the whole allowance.
 */
export const LOW_BALANCE_OUTPUT_TOKENS = 6_000;
const TIER_RANK = { fast: 0, balanced: 1, flagship: 2 } as const;

export type LiveList = { ok: true; models: LiveModel[] } | { ok: false; error: string; unsupported: boolean };

const lists = new Map<string, { at: number; value: LiveList }>();
const quarantined = new Map<string, number>();
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
const connectionKey = (provider: string, via: string | undefined, baseUrl: string | undefined, apiKey: string | undefined) => hash(`${provider}\0${via ?? provider}\0${baseUrl ?? ""}\0${apiKey ?? ""}`);

let aiFetch: typeof fetch | undefined;
export function setLiveModelsFetch(f: typeof fetch | undefined): void { aiFetch = f; lists.clear(); }

/** The provider's live model list for this connection (cached). Never throws. */
export async function liveModelsFor(e: Pick<KeyringEntry, "provider" | "via" | "apiKey" | "baseUrl">, force = false): Promise<LiveList> {
  const key = connectionKey(e.provider, e.via, e.baseUrl, e.apiKey);
  const hit = lists.get(key);
  if (!force && hit && Date.now() - hit.at < (hit.value.ok ? LIST_TTL_MS : FAILED_LIST_TTL_MS)) return hit.value;
  let value: LiveList;
  try {
    const models = await listModelsFor({ provider: e.provider, via: e.via, baseUrl: e.baseUrl }, { apiKey: e.apiKey, fetchImpl: aiFetch ?? createAiFetch(), signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    value = models.length ? { ok: true, models } : { ok: false, error: "The provider returned an empty model list.", unsupported: false };
  } catch (err) {
    const unsupported = err instanceof ModelListError && err.unsupported;
    value = { ok: false, unsupported, error: err instanceof ModelListError || err instanceof AiEndpointBlockedError ? err.message : "Could not reach the provider to list its models." };
  }
  lists.set(key, { at: Date.now(), value });
  return value;
}

const qKey = (group: string | undefined, apiKey: string | undefined, model: string) => `${group ?? ""}\0${hash(apiKey ?? "")}\0${model}`;

/** Remember that this connection's provider no longer serves this model. */
export function quarantineModel(c: Pick<Candidate, "group" | "provider" | "model" | "credential">): void {
  quarantined.set(qKey(c.group ?? c.provider, c.credential?.apiKey, c.model), Date.now() + QUARANTINE_MS);
  // The list this came from is stale: fetch a fresh one next time.
  lists.delete(connectionKey(c.provider, c.group, c.credential?.baseUrl, c.credential?.apiKey));
}
export const isQuarantined = (group: string | undefined, apiKey: string | undefined, model: string): boolean => {
  const k = qKey(group, apiKey, model);
  const until = quarantined.get(k);
  if (!until) return false;
  if (until < Date.now()) { quarantined.delete(k); return false; }
  return true;
};
/**
 * Models this key may not use for now. A free tier often gives some models no allowance at all
 * ("limit: 0") or a small daily one; such a model is skipped when choosing for later requests
 * instead of being tried (and failing) first each time. A per-minute limit is remembered briefly.
 */
const limited = new Map<string, number>();
const ZERO_ALLOWANCE = /limit:\s*0\b|free.?tier/i;
const LIMITED_LONG_MS = 6 * 60 * 60_000;
const LIMITED_SHORT_MS = 2 * 60_000;

/** Remember a model's refusal on this key: long for a zero or daily allowance, briefly for a per-minute one. */
export function markModelLimited(c: Pick<Candidate, "group" | "provider" | "model" | "credential">, f: Pick<Failure, "kind" | "message" | "daily" | "retryAfterMs">): void {
  if (f.kind !== "rate_limit") return;
  const long = f.daily || ZERO_ALLOWANCE.test(f.message);
  const ms = long ? LIMITED_LONG_MS : Math.max(f.retryAfterMs ?? 0, LIMITED_SHORT_MS);
  limited.set(qKey(c.group ?? c.provider, c.credential?.apiKey, c.model), Date.now() + ms);
}
export const isLimited = (group: string | undefined, apiKey: string | undefined, model: string): boolean => {
  const k = qKey(group, apiKey, model);
  const until = limited.get(k);
  if (!until) return false;
  if (until < Date.now()) { limited.delete(k); return false; }
  return true;
};

/** What the router learns from a failed model, in one place for every server route. */
export function learnFromFailure(c: Candidate, f: Failure): void {
  if (f.kind === "model_unavailable") quarantineModel(c);
  markModelLimited(c, f);
}

/**
 * Model sizes in the order a task wants them when the person has not chosen a model:
 * quick tasks take the fast tier first; drafting, research and long documents take the
 * balanced and flagship tiers first. Every tier stays in the list as a backup.
 */
export const TIER_ORDER_FOR_TASK: Record<TaskClass, ModelTier[]> = {
  fast: ["fast", "balanced", "flagship"],
  vision: ["balanced", "fast", "flagship"],
  coding: ["balanced", "flagship", "fast"],
  drafting: ["balanced", "flagship", "fast"],
  reasoning: ["flagship", "balanced", "fast"],
  "long-context": ["balanced", "flagship", "fast"],
};

export const clearLiveModelState = (): void => { lists.clear(); quarantined.clear(); limited.clear(); };

export interface ExpandResult {
  entries: KeyringEntry[];
  /** Plain-words events for the user: a replaced model, an unusable connection. */
  notices: Array<{ kind: "fallback" | "skipped"; text: string }>;
}

const label = (e: KeyringEntry) => e.label ?? e.via ?? e.provider;

/**
 * One keyring entry → the entries to try for it: the model to use, then up to
 * two live alternates. Local runners and entries the provider cannot list pass
 * through unchanged when they name a model.
 */
export async function expandEntry(e: KeyringEntry, task: TaskClass, maxAlternates = 2): Promise<ExpandResult> {
  const notices: ExpandResult["notices"] = [];
  if (LOCAL.has(e.provider)) return { entries: [e], notices };
  const asked = e.model && e.model !== "auto" ? e.model : undefined;
  const group = e.via ?? e.provider;

  const list = await liveModelsFor(e);
  if (!list.ok) {
    if (asked && !isQuarantined(group, e.apiKey, asked)) return { entries: [e], notices }; // cannot verify, trust the user's choice
    notices.push({ kind: "skipped", text: `Skipped ${label(e)}: ${asked ? `${asked} is not available right now and ` : ""}${list.unsupported ? `no model is chosen. ${list.error}` : `its models could not be listed (${list.error})`}` });
    return { entries: [], notices };
  }

  const byId = new Map(list.models.map((m) => [m.id, m]));
  const blocked = (id: string) => isQuarantined(group, e.apiKey, id) || isLimited(group, e.apiKey, id);
  const usable = (id: string) => byId.has(id) && !blocked(id);
  const exclude = new Set(list.models.map((m) => m.id).filter(blocked));
  const rec = recommendModels(group, list.models, { exclude });

  const slot = e.slot && e.slot > 1 ? `#${e.slot}` : "";
  const hint = serverOutputCaps.get(balanceHintKey(connectionName(`${group}${slot}`, e.apiKey, e.baseUrl)));
  const balanceLimited = hint !== undefined && hint <= LOW_BALANCE_OUTPUT_TOKENS;

  // No model chosen by the person ("auto"): the task picks. Its preferred size first, then the
  // other sizes as backups, from a wider pool than the curated picks, skipping models this key
  // cannot use now. A model the person chose is kept as their choice (below).
  if (!asked && !balanceLimited) {
    const order = TIER_ORDER_FOR_TASK[task] ?? TIER_ORDER_FOR_TASK.drafting;
    const pool = curateModels(group, list.models.filter((m) => !exclude.has(m.id)), { maxPerProvider: 12, previewMaxAgeDays: 365 });
    const rank = (t: ModelTier) => { const i = order.indexOf(t); return i === -1 ? order.length : i; };
    const recIds = rec.options.map((o) => o.id);
    const ranked = [...pool].sort((a, b) => rank(a.tier) - rank(b.tier) || (recIds.includes(a.id) ? 0 : 1) - (recIds.includes(b.id) ? 0 : 1));
    const picked = ranked.map((m) => m.id).slice(0, 1 + maxAlternates);
    if (picked.length) {
      return {
        entries: picked.map((id): KeyringEntry => {
          const m = byId.get(id);
          const out = m?.maxOutputTokens ? Math.min(m.maxOutputTokens, OUTPUT_CAP) : undefined;
          return { ...e, model: id, contextWindow: e.contextWindow ?? m?.contextWindow, maxOutputTokens: out ?? UNKNOWN_OUTPUT_LIMIT };
        }),
        notices,
      };
    }
  }

  let primary = asked && usable(asked) ? asked : undefined;
  if (!primary) {
    const wanted = task === "fast" || balanceLimited ? rec.options.find((o) => o.role === "fastest") : undefined;
    primary = (wanted ?? rec.recommended)?.id;
    if (!primary) {
      notices.push({ kind: "skipped", text: `Skipped ${label(e)}: none of the models it lists can be used for text.` });
      return { entries: [], notices };
    }
    if (asked) notices.push({ kind: "fallback", text: `${asked} is no longer available from ${label(e)}; using ${primary}, the best model it lists now.` });
  }

  const lightFirst = (a: { id: string; tier?: keyof typeof TIER_RANK }, b: { id: string; tier?: keyof typeof TIER_RANK }) => TIER_RANK[a.tier ?? "balanced"] - TIER_RANK[b.tier ?? "balanced"];
  const alternates = rec.options.filter((o) => o.id !== primary && usable(o.id));
  if (balanceLimited) alternates.sort(lightFirst);
  const chosen = [primary, ...alternates.map((o) => o.id).slice(0, maxAlternates)];
  if (balanceLimited && !asked) notices.push({ kind: "fallback", text: `${label(e)} has little credit left (about ${hint!.toLocaleString("en")} output tokens), so its lighter models are tried first.` });
  const entries = chosen.map((id): KeyringEntry => {
    const m = byId.get(id);
    const out = m?.maxOutputTokens ? Math.min(m.maxOutputTokens, OUTPUT_CAP) : undefined;
    return {
      ...e,
      model: id,
      contextWindow: e.contextWindow ?? m?.contextWindow,
      maxOutputTokens: id === asked ? e.maxOutputTokens ?? out : out ?? UNKNOWN_OUTPUT_LIMIT,
    };
  });
  return { entries, notices };
}

/**
 * Most candidates one request's chain may hold. Each is a possible round trip, and the router stops starting new
 * ones after `DEFAULT_MAX_TOTAL_MS` (150 s), so a chain of three models for each of 24 connections could time out
 * before reaching its last provider. Every connection keeps its primary model; alternates fill what is left.
 */
export const MAX_CHAIN_CANDIDATES = 40;

/** Alternates asked for per connection: generous for a short keyring, none for a very large one (primaries first, always). */
export function alternatesPerConnection(connections: number): number {
  return connections <= 6 ? 2 : connections <= 12 ? 1 : 0;
}

/**
 * Trims expanded connections to `max` candidates in total: every connection's first entry is kept, then alternates
 * are granted in the person's order until the budget is spent. Order inside and between connections is unchanged.
 */
export function fitCandidateBudget(parts: ExpandResult[], max = MAX_CHAIN_CANDIDATES): ExpandResult[] {
  const primaries = parts.reduce((n, p) => n + Math.min(1, p.entries.length), 0);
  let spare = Math.max(0, max - primaries);
  return parts.map((p) => {
    if (p.entries.length <= 1) return p;
    const grant = Math.min(p.entries.length - 1, spare);
    spare -= grant;
    return { ...p, entries: p.entries.slice(0, 1 + grant) };
  });
}

/** Expands a whole keyring, keeping each connection's models together and the user's order. */
export async function expandKeyring(entries: KeyringEntry[], task: TaskClass): Promise<ExpandResult> {
  const alternates = alternatesPerConnection(entries.length);
  // One or two connections with no model chosen: try a few more of each provider's models. Free tiers
  // refuse per model and answer such refusals within a second, so this is cheap, and it is often the
  // difference between an answer and none.
  const autoAlternates = entries.length <= 2 ? 4 : alternates;
  const parts = fitCandidateBudget(
    await Promise.all(entries.map((e) => expandEntry(e, task, e.model && e.model !== "auto" ? alternates : autoAlternates)))
  );
  return { entries: parts.flatMap((p) => p.entries), notices: parts.flatMap((p) => p.notices) };
}

/** Catalog connection → keyring entry, resolving the router protocol; for verification and tests. */
export function entryFromCatalog(catalogId: string, input: { apiKey?: string; model?: string; baseUrl?: string }): { ok: true; entry: KeyringEntry } | { ok: false; reason: string } {
  const t = resolveRouterTarget(catalogId, input.baseUrl);
  if (!t.ok) return t;
  return { ok: true, entry: { provider: t.target.provider, via: t.target.via, model: input.model || "auto", apiKey: input.apiKey, baseUrl: t.target.baseUrl, label: t.target.name } };
}
