/**
 * Live model resolution for the user's own AI connections.
 *
 * Model line-ups change monthly, so nothing here (or anywhere on the server)
 * names a model. For each connection with a key:
 *   1. the provider's own model list is fetched live (cached; a failure is
 *      remembered briefly so a dead endpoint is not hammered);
 *   2. the model the user saved is kept only while the provider still lists it;
 *      a missing, "auto" or retired choice is replaced by the live recommendation;
 *   3. up to two other good live models of the same connection follow it, so
 *      one retired, rate-limited or empty-answering model never ends the request;
 *   4. a model the provider says is gone is quarantined for a while, so the next
 *      request skips it instead of failing on it first.
 *
 * Keys are used for the request in hand; only a hash of one is ever a map key.
 */
import { createHash } from "node:crypto";
import { listModelsFor, ModelListError } from "../../../src/platform/router/modelListers.ts";
import type { LiveModel } from "../../../src/platform/router/modelCuration.ts";
import { recommendModels } from "../../../src/platform/router/modelRecommendation.ts";
import { resolveRouterTarget } from "../../../src/platform/router/providerMap.ts";
import type { Candidate, TaskClass } from "../../../src/platform/router/types.ts";
import type { KeyringEntry } from "../../routes/aiRun.ts";
import { AiEndpointBlockedError, createAiFetch } from "./aiEndpointGuard.ts";

const LIST_TTL_MS = 6 * 60 * 60_000;
const FAILED_LIST_TTL_MS = 2 * 60_000;
const QUARANTINE_MS = 30 * 60_000;
const LIST_TIMEOUT_MS = 6_000;
/** Largest answer we ask a model for when the provider reports its own limit. */
const OUTPUT_CAP = 32_768;
/** A model with an unreported output limit is asked for no more than this: nearly every modern model accepts it. */
export const UNKNOWN_OUTPUT_LIMIT = 8_192;
const LOCAL = new Set(["ollama", "lmstudio", "webllm"]);

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
export const clearLiveModelState = (): void => { lists.clear(); quarantined.clear(); };

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
  const usable = (id: string) => byId.has(id) && !isQuarantined(group, e.apiKey, id);
  const exclude = new Set(list.models.map((m) => m.id).filter((id) => isQuarantined(group, e.apiKey, id)));
  const rec = recommendModels(group, list.models, { exclude });

  let primary = asked && usable(asked) ? asked : undefined;
  if (!primary) {
    const wanted = task === "fast" ? rec.options.find((o) => o.role === "fastest") : undefined;
    primary = (wanted ?? rec.recommended)?.id;
    if (!primary) {
      notices.push({ kind: "skipped", text: `Skipped ${label(e)}: none of the models it lists can be used for text.` });
      return { entries: [], notices };
    }
    if (asked) notices.push({ kind: "fallback", text: `${asked} is no longer available from ${label(e)}; using ${primary}, the best model it lists now.` });
  }

  const chosen = [primary, ...rec.options.map((o) => o.id).filter((id) => id !== primary && usable(id)).slice(0, maxAlternates)];
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

/** Expands a whole keyring, keeping each connection's models together and the user's order. */
export async function expandKeyring(entries: KeyringEntry[], task: TaskClass): Promise<ExpandResult> {
  const parts = await Promise.all(entries.map((e) => expandEntry(e, task)));
  return { entries: parts.flatMap((p) => p.entries), notices: parts.flatMap((p) => p.notices) };
}

/** Catalog connection → keyring entry, resolving the router protocol; for verification and tests. */
export function entryFromCatalog(catalogId: string, input: { apiKey?: string; model?: string; baseUrl?: string }): { ok: true; entry: KeyringEntry } | { ok: false; reason: string } {
  const t = resolveRouterTarget(catalogId, input.baseUrl);
  if (!t.ok) return t;
  return { ok: true, entry: { provider: t.target.provider, via: t.target.via, model: input.model || "auto", apiKey: input.apiKey, baseUrl: t.target.baseUrl, label: t.target.name } };
}
