/**
 * Central scholarBrain Orchestrator
 *
 * Core engine unifying all 5 Scholar OS workspaces:
 * 1. Unified Client-Owned AI Execution: Resolves the request's x-ai-keyring header with zero hardcoded models and zero server keys.
 * 2. Unified Live Scholarly & Vault Discovery: Queries OpenAlex, Crossref, EuropePMC/PubMed,
 *    arXiv, and project Knowledge Vault + uploaded primary user datasets ([CITE:src_id] / [CITE:user_data_id]).
 * 3. Unified Citation Lock & Chronological Scrubber: Strips hallucinated (Author, Year) strings
 *    and formats verified [CITE:id] tokens in APA 7, IEEE, Harvard, Chicago, MLA 9, or Vancouver.
 * 4. Unified Voice & Style Engine: Enforces British/Oxford orthography (-ise, -our, -re),
 *    preserves NFC Unicode/IAST diacritics (ā, ī, ū, ṛ, ś, ṣ, ṇ), suppresses clichés, and computes burstiness.
 * 5. Deterministic Mark-Weighted Word Allocator: Proportional allocation across assignment questions.
 */

import { buildAskGeneralPrompt, buildAskSearchPrompt } from "../../../src/shared/askPrompts.ts";
import { NoAiConnectedError, routedText, RouterHandoffError, toRouterTask } from "../ai/routerBridge.ts";
import { BrowserAiRequiredError, LocalModelUnreachableError, NoClientAiProviderError } from "../ai/aiRouteErrors.ts";
import {
  createChallengeTokenForRequest,
  readVerifiedBrowserResult,
  type LlmRequestLike,
} from "../../utils/llm.ts";
import type { CompletionTask as TaskClass } from "../../../src/platform/completion.ts";
import { applyScholarGuardrails } from "../../../src/shared/scholarGuardrails.ts";
import { parseAndRepairLLMJson } from "../../../src/shared/llmJsonParser.ts";
import { chunkAndRerankEvidence } from "./semanticRagEngine.ts";
import { runAgent } from "../../../src/app/mesh/executor.ts";
import { ag14CitationManager } from "../../../src/app/mesh/agents/ag14CitationManager.ts";
import { ag18ReadabilityAnalyst } from "../../../src/app/mesh/agents/ag18ReadabilityAnalyst.ts";
import { ag25PrivacyGuard } from "../../../src/app/mesh/agents/ag25PrivacyGuard.ts";
import { ag26WorkflowCoordinator } from "../../../src/app/mesh/agents/ag26WorkflowCoordinator.ts";
import { issue, revoke } from "../../../src/services/capabilities/capabilities.ts";
import { initialProjectGateState } from "../../../src/app/conductor/conductor.ts";
import {
  callOpenRouterJSON as rawCallOpenRouterJSON,
  callOpenRouterText as rawCallOpenRouterText,
  handOffBeforeStream as rawHandOffBeforeStream,
  streamOpenRouterJSON as rawStreamOpenRouterJSON,
  signLlmChallenge,
  computePromptHash,
  generateGeminiEmbedding,
} from "../../utils/llm.ts";
import { loadArchetypeModelWeights, type ArchetypeModelWeights } from "../../../src/shared/archetypeModelWeights.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
  evaluateBurstiness,
  type ScholarlyDialect,
} from "../utils/scholarlyVoiceGuard.ts";
import {
  scrubCitations,
  formatCitationLedger,
  type VerifiedSourceItem,
  type ScrubResult,
  type ChronologicalWarning,
} from "../utils/citationLockScrubber.ts";
import { CitationStyleRegistry } from "../../../src/citation_compliance/formattingEngine.ts";
import type { CanonicalReference, ReferenceAuthor } from "../../../src/citation_compliance/model/reference.ts";
import {
  discoverMultiPortalSources,
  type DiscoveredSourceDraft,
} from "../discovery/discovery.ts";
import {
  allocateWordsByMarks,
  parseQuestionMarks,
  countExactWords,
  type BriefQuestionInput,
  type QuestionWordBudget,
  type MarkAllocationResult,
} from "../utils/wordBudgetAllocator.ts";

export type CitationStyleKey = "apa7" | "harvard" | "ieee" | "chicago" | "mla9" | "vancouver" | "oscola";

export interface ScholarBrainAiRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  user?: { id?: string };
  originalUrl?: string;
  url?: string;
}

export interface ScholarBrainCompleteOptions {
  req?: ScholarBrainAiRequestLike;
  systemPrompt?: string;
  userPrompt: string;
  taskClass?: TaskClass;
  dialect?: ScholarlyDialect;
  stripCliches?: boolean;
  lockedTerms?: string[];
  responseFormat?: "text" | "json";
  temperature?: number;
  maxTokens?: number;
  /**
   * When the user's only AI is a local model (which the server cannot reach),
   * hand the exact prompt to their browser with a signed challenge (426) instead
   * of failing. The route must build the same prompt on the retried request.
   */
  browserFallback?: boolean;
}

export interface StreamPromptConfig {
  systemPrompt?: string;
  userPrompt: string;
  taskClass?: TaskClass;
  dialect?: ScholarlyDialect;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}

export interface ScholarBrainBurstinessMetrics {
  averageLength: number;
  variance: number;
  burstinessScore: number;
  isSufficientlyBurst: boolean;
}

export interface ScholarBrainCompleteResult {
  text: string;
  rawResponse?: string;
  parsedJson?: unknown;
  provider: string;
  model: string;
  wordCount: number;
  burstinessMetrics: ScholarBrainBurstinessMetrics;
}

export interface PrimaryUserDataset {
  id: string;
  name: string;
  description?: string;
  summary?: string;
  rowCount?: number;
  variables?: string[];
}

export interface EvidenceDiscoveryOptions {
  query: string;
  maxResults?: number;
  projectId?: string;
  vaultSources?: VerifiedSourceItem[];
  userDatasets?: PrimaryUserDataset[];
}

export interface UnifiedEvidenceItem {
  id: string;
  citationToken: string; // e.g. "[CITE:src_1]" or "[CITE:user_data_1]"
  title: string;
  authors: string[];
  year?: number | string;
  doi?: string;
  url?: string;
  venue?: string;
  sourceType: "scholarly" | "vault" | "primary_data";
  authorityTier: "A" | "B" | "C";
  provenance: string;
  summary?: string;
}

export interface UnifiedCitationScrubResult extends ScrubResult {
  style: CitationStyleKey;
  bibliographyMarkdown: string;
  formattedText: string;
  referencesLedger: string;
  hallucinatedCitationsStripped: string[];
}

/**
 * Fetches biomedical and life sciences evidence from Europe PMC / PubMed.
 */
async function discoverEuropePmcSources(query: string, maxResults = 10): Promise<DiscoveredSourceDraft[]> {
  try {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
      query
    )}&format=json&pageSize=${Math.min(maxResults, 25)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    interface EuropePmcItem {
      id?: string;
      title?: string;
      authorString?: string;
      pubYear?: string;
      journalTitle?: string;
      doi?: string;
    }
    const data = (await res.json()) as { resultList?: { result?: EuropePmcItem[] } };
    const items = data.resultList?.result ?? [];

    return items
      .filter((item): item is EuropePmcItem & { title: string } => Boolean(item.title))
      .map((item) => {
        const authors = item.authorString
          ? item.authorString.split(",").map((a) => a.trim()).filter(Boolean)
          : [];
        const year = item.pubYear ? parseInt(item.pubYear, 10) : undefined;
        return {
          title: item.title,
          authors,
          year: !isNaN(Number(year)) ? year : undefined,
          doi: item.doi,
          url: item.doi ? `https://doi.org/${item.doi}` : undefined,
          venue: item.journalTitle,
          discoveredVia: "europepmc" as const,
          sourceType: "scholarly" as const,
          authorityTier: "A" as const,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Maps raw author strings to ReferenceAuthor array.
 */
function parseAuthorsForCitation(authors: string[] | string): ReferenceAuthor[] {
  const authorList: string[] = Array.isArray(authors)
    ? authors
    : authors.split(/\s*(?:and|&|;)\s*/);

  return authorList
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, idx) => {
      const clean = name.replace(/\bet\sal\.?/gi, "").trim();
      if (clean.includes(",")) {
        const [last, first] = clean.split(",");
        return {
          lastName: last.trim(),
          firstName: first ? first.trim() : "",
          order: idx + 1,
        };
      }
      const parts = clean.split(/\s+/).filter(Boolean);
      return {
        lastName: parts[parts.length - 1] || clean,
        firstName: parts.slice(0, -1).join(" "),
        order: idx + 1,
      };
    });
}

/**
 * Live discovery results, cached per query for 20 minutes. Besides saving
 * network calls, this keeps a route's prompt identical when the browser-local
 * AI hand-off (426) retries the same request, so its signed prompt hash matches.
 */
const LIVE_DISCOVERY_TTL_MS = 20 * 60 * 1000;
const LIVE_DISCOVERY_MAX_ENTRIES = 200;
type LiveDraft = Awaited<ReturnType<typeof discoverMultiPortalSources>>[number];
const liveDiscoveryCache = new Map<string, { at: number; results: Promise<LiveDraft[]> }>();

export function __clearLiveDiscoveryCacheForTests(): void {
  liveDiscoveryCache.clear();
}

function cachedLiveDiscovery(query: string, maxResults: number): Promise<LiveDraft[]> {
  const key = `${maxResults}|${query.trim().toLowerCase()}`;
  const now = Date.now();
  const hit = liveDiscoveryCache.get(key);
  if (hit && now - hit.at < LIVE_DISCOVERY_TTL_MS) return hit.results;

  const results = Promise.all([
    discoverMultiPortalSources(query, maxResults),
    discoverEuropePmcSources(query, Math.min(10, Math.ceil(maxResults / 3))),
  ]).then(([multi, epmc]) => [...multi, ...epmc] as LiveDraft[]);
  // A failed lookup is not cached, so the next request retries it.
  results.catch(() => liveDiscoveryCache.delete(key));

  liveDiscoveryCache.set(key, { at: now, results });
  if (liveDiscoveryCache.size > LIVE_DISCOVERY_MAX_ENTRIES) {
    const oldest = liveDiscoveryCache.keys().next().value;
    if (oldest !== undefined) liveDiscoveryCache.delete(oldest);
  }
  return results;
}

/**
 * SINGLE LLM GATEWAY. scholarBrain.ts is the only module allowed to import
 * server/utils/llm.ts. The three execution functions below are real wrappers,
 * not pass-throughs: every call is timed and logged (task type + outcome only,
 * never prompt text or credentials), failures are logged once with context and
 * rethrown unchanged so route-level handling (NoAiConnectedError,
 * BrowserAiRequiredError, ...) keeps working, and text output is NFC-normalised.
 * Orthography/cliché rewriting stays opt-in via scholarBrain.complete()/stream(),
 * because generic text calls (JSON, code, citations) must not be rewritten.
 */
export {
  signLlmChallenge,
  computePromptHash,
  generateGeminiEmbedding,
  readVerifiedBrowserResult,
};

async function runGatewayCall<T>(kind: string, taskType: string | undefined, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    console.info(`[scholarBrain] ${kind} ok task=${taskType ?? "reasoning"} ms=${Date.now() - started}`);
    return result;
  } catch (err) {
    const name = err instanceof Error ? err.constructor.name : typeof err;
    console.warn(`[scholarBrain] ${kind} failed task=${taskType ?? "reasoning"} ms=${Date.now() - started} error=${name}`);
    throw err;
  }
}

export function callOpenRouterJSON<T = any>(...args: Parameters<typeof rawCallOpenRouterJSON>): Promise<T> {
  return runGatewayCall("json", args[5], () => rawCallOpenRouterJSON<T>(...args));
}

export function callOpenRouterText(...args: Parameters<typeof rawCallOpenRouterText>): ReturnType<typeof rawCallOpenRouterText> {
  return runGatewayCall("text", args[5], async () => {
    const text = await rawCallOpenRouterText(...args);
    return typeof text === "string" ? normalizeUnicodeNFC(text) : text;
  });
}

/**
 * Before an SSE route flushes its headers: hand the request to the browser
 * (426) when no server-side model can answer. True = handed off, stop here.
 */
export function handOffBeforeStream(...args: Parameters<typeof rawHandOffBeforeStream>): ReturnType<typeof rawHandOffBeforeStream> {
  return rawHandOffBeforeStream(...args);
}

export function streamOpenRouterJSON(...args: Parameters<typeof rawStreamOpenRouterJSON>): ReturnType<typeof rawStreamOpenRouterJSON> {
  return runGatewayCall("stream", args[5], () => rawStreamOpenRouterJSON(...args));
}

/** Centrally managed quantitative style weights (trained archetype model). */
export function getArchetypeModelWeights(): ArchetypeModelWeights {
  return loadArchetypeModelWeights();
}

/**
 * Canonical scholarBrain Orchestrator Object
 */
export const scholarBrain = {
  /** System prompt for AskScholar answers (search-grounded or general). One owner for the text, every surface shares it. */
  askSystemPrompt(opts: { kind: "search"; style: string; length: string } | { kind: "general"; base: string; style: string; length: string }): string {
    return opts.kind === "search"
      ? buildAskSearchPrompt({ style: opts.style, length: opts.length })
      : buildAskGeneralPrompt({ base: opts.base, style: opts.style, length: opts.length });
  },

  callJSON: (...args: Parameters<typeof callOpenRouterJSON>) => callOpenRouterJSON(...args),
  callText: (...args: Parameters<typeof callOpenRouterText>) => callOpenRouterText(...args),
  streamJSON: (...args: Parameters<typeof streamOpenRouterJSON>) => streamOpenRouterJSON(...args),
  signLlmChallenge: (...args: Parameters<typeof signLlmChallenge>) => signLlmChallenge(...args),
  computePromptHash: (...args: Parameters<typeof computePromptHash>) => computePromptHash(...args),
  generateGeminiEmbedding: (...args: Parameters<typeof generateGeminiEmbedding>) => generateGeminiEmbedding(...args),
  readVerifiedBrowserResult: (...args: Parameters<typeof readVerifiedBrowserResult>) => readVerifiedBrowserResult(...args),
  getArchetypeModelWeights,
  /**
   * 1. Unified Client-Owned AI Execution
   * Strictly enforces client-owned BYOK/Local routing, zero hardcoded models,
   * zero server keys, British/Oxford orthography, and NFC Unicode preservation.
   */
  async complete(options: ScholarBrainCompleteOptions): Promise<ScholarBrainCompleteResult> {
    const dialect = options.dialect ?? "en-GB";
    const voicePrompt = buildScholarlyVoiceSystemPrompt({
      dialect,
      lockedTerms: options.lockedTerms,
    });

    const fullSystemPrompt = options.systemPrompt
      ? `${voicePrompt}\n\n[TASK DIRECTIVES]\n${options.systemPrompt}`
      : voicePrompt;

    const req = (options.req ?? { headers: {} }) as LlmRequestLike;
    const browserPayload = () => ({
      challengeToken: createChallengeTokenForRequest(req, fullSystemPrompt, options.userPrompt),
      systemPrompt: fullSystemPrompt,
      userPrompt: options.userPrompt,
      taskType: "reasoning",
    });

    // A browser-run answer for exactly this prompt (verified challenge) is used as is.
    const browserText = readVerifiedBrowserResult(req, fullSystemPrompt, options.userPrompt);
    let rawText: string;
    let answeredBy = "browser-local";
    if (browserText !== null) {
      rawText = browserText;
    } else {
      try {
        rawText = await routedText(req as unknown as import("express").Request, {
          task: toRouterTask(options.taskClass ?? "drafting"),
          systemPrompt: fullSystemPrompt,
          userPrompt: options.userPrompt,
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        });
        answeredBy = (req as { aiRoute?: { answeredBy?: { label: string } } }).aiRoute?.answeredBy?.label ?? "router";
      } catch (err) {
        if (err instanceof NoAiConnectedError) throw new NoClientAiProviderError();
        if (err instanceof RouterHandoffError) {
          if (options.browserFallback) throw new BrowserAiRequiredError(browserPayload());
          throw new LocalModelUnreachableError();
        }
        throw new Error(`scholarBrain AI Execution Error: ${(err as Error).message}`);
      }
    }
    const guarded = applyScholarGuardrails(rawText, {
      orthography: dialect === "en-US" ? "us" : "british",
      stripCliches: options.stripCliches ?? true,
    });
    const normalizedText = guarded.text;

    let parsedJson: unknown = undefined;
    if (options.responseFormat === "json") {
      parsedJson = parseAndRepairLLMJson(normalizedText, undefined);
    }

    return {
      text: normalizedText,
      rawResponse: rawText,
      parsedJson,
      provider: answeredBy,
      model: answeredBy,
      wordCount: guarded.wordCount,
      burstinessMetrics: {
        averageLength: guarded.averageSentenceLength,
        variance: guarded.variance,
        burstinessScore: guarded.burstinessScore,
        isSufficientlyBurst: guarded.isSufficientlyBurst,
      },
    };
  },

  /**
   * 1b. SSE Streaming AI Execution
   * Direct SSE endpoint wrapping streamWithFailover with real-time token emission and guardrails.
   */
  async stream(
    req: any,
    promptConfig: StreamPromptConfig,
    res: any
  ): Promise<{ text: string; fullText: string }> {
    const {
      systemPrompt = "You are an elite academic peer reviewer and scholarly researcher.",
      userPrompt,
      taskClass = "drafting",
      dialect = "en-GB",
      temperature = 0.5,
      maxTokens = 4096,
      onChunk,
    } = promptConfig;

    const effectiveUserPrompt = userPrompt || (promptConfig as any).prompt || "Empirical scholarly inquiry";
    const effectiveSystemPrompt = systemPrompt || (promptConfig as any).systemInstruction || "You are an elite academic peer reviewer and scholarly researcher.";

    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
    }

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const fullSystemPrompt = buildScholarlyVoiceSystemPrompt({ dialect }) + "\n\n" + effectiveSystemPrompt;
    let fullText = "";

    const streamAbort = new AbortController();
    const onClose = () => { if (!res.writableFinished) streamAbort.abort(); };
    res?.on?.("close", onClose);

    try {
      sendSSE("status", { message: "Generating scholarly draft via streaming..." });

      // No AI connected is an error the user can act on, never a simulated draft.
      fullText = await routedText(req ?? { headers: {} }, {
        task: toRouterTask(taskClass),
        systemPrompt: fullSystemPrompt,
        userPrompt: effectiveUserPrompt,
        temperature,
        maxOutputTokens: maxTokens,
        signal: streamAbort.signal,
        onEvent: (ev) => {
          if (ev.type === "token") {
            if (streamAbort.signal.aborted) return;
            sendSSE("chunk", { token: ev.text });
            if (onChunk) onChunk(ev.text);
            return;
          }
          if (ev.type === "fallback") sendSSE("status", { message: `Switched from ${ev.fromLabel} to ${ev.toLabel}: ${ev.message}` });
          if (ev.type === "retry") sendSSE("status", { message: `${ev.message}. Retrying in ${Math.ceil(ev.waitMs / 1000)}s` });
          sendSSE("route", ev);
        },
      });

      const guardrails = applyScholarGuardrails(fullText, {
        orthography: dialect === "en-US" ? "us" : "british",
        stripCliches: true,
      });

      sendSSE("done", {
        text: guardrails.text,
        wordCount: guardrails.wordCount,
        burstinessMetrics: {
          averageLength: guardrails.averageSentenceLength,
          variance: guardrails.variance,
          burstinessScore: guardrails.burstinessScore,
          isSufficientlyBurst: guardrails.isSufficientlyBurst,
        },
      });

      res.end();
      return { text: guardrails.text, fullText };
    } catch (err: unknown) {
      if (!streamAbort.signal.aborted) {
        const errMsg = (err as Error)?.message || "Streaming failed";
        sendSSE("error", { message: errMsg });
        res.end();
      }
      throw err;
    } finally {
      res?.off?.("close", onClose);
    }
  },

  /**
   * Pre-flight Mesh Agent Validation (AG-14, AG-18, AG-25, AG-26)
   */
  async validatePreflightMesh(
    userIdOrOptions?: string | {
      text?: string;
      references?: CanonicalReference[];
      project?: any;
      egressRequest?: any;
      userId?: string;
    },
    maybeOptions?: {
      text?: string;
      references?: CanonicalReference[];
      project?: any;
      egressRequest?: any;
      userId?: string;
    }
  ): Promise<any> {
    let options: {
      text?: string;
      references?: CanonicalReference[];
      project?: any;
      egressRequest?: any;
      userId?: string;
    };
    let userId: string;

    if (typeof userIdOrOptions === "string") {
      userId = userIdOrOptions;
      options = maybeOptions || {};
    } else {
      options = userIdOrOptions || {};
      userId = options.userId || "conductor-preflight";
    }

    const textToAnalyze = options.text || "Empirical benchmarking of autonomous agent latency under stochastic conditions.";
    const issuedTokens: string[] = [];

    const runWithTokens = async (agent: any, input: any) => {
      const tokens = agent.permissions.map((p: string) => issue(agent.id, p, userId));
      tokens.forEach((t: any) => issuedTokens.push(t.id));
      return runAgent(agent, input, {
        subject: agent.id,
        capabilityTokenIds: tokens.map((t: any) => t.id),
      });
    };

    try {
      // AG-25: Privacy Guard
      const ag25Res = await runWithTokens(ag25PrivacyGuard, {
        request: options.egressRequest || {
          provider: "anthropic",
          taskClass: "drafting",
          segments: [{ label: "draft", text: textToAnalyze }],
        },
      });

      // AG-18: Readability Analyst
      const ag18Res = await runWithTokens(ag18ReadabilityAnalyst, {
        text: textToAnalyze,
      });

      // AG-14: Citation Manager
      const sampleRefs: CanonicalReference[] = options.references && options.references.length > 0
        ? options.references
        : [
            {
              kind: "JournalArticle",
              title: "Attention Is All You Need",
              source: "NeurIPS",
              authors: [{ firstName: "Ashish", lastName: "Vaswani", order: 1 }],
              publicationDate: "2017",
            },
          ];

      const ag14Res = await runWithTokens(ag14CitationManager, {
        style: "apa-7",
        references: sampleRefs,
        citedReferenceIndices: [0],
      });

      // AG-26: Workflow Coordinator
      const projectState = options.project || initialProjectGateState("proj-preflight");
      const ag26Res = await runWithTokens(ag26WorkflowCoordinator, {
        project: projectState,
      });

      const allPassed =
        ag25Res.status === "completed" &&
        ag18Res.status === "completed" &&
        ag14Res.status === "completed" &&
        ag26Res.status === "completed";

      const resultsArray: any = [
        { agentId: "AG-14", ok: ag14Res.status === "completed", output: ag14Res.output },
        { agentId: "AG-18", ok: ag18Res.status === "completed", output: ag18Res.output },
        { agentId: "AG-25", ok: ag25Res.status === "completed", output: ag25Res.output },
        { agentId: "AG-26", ok: ag26Res.status === "completed", output: ag26Res.output },
      ];

      resultsArray.ag14 = ag14Res.output;
      resultsArray.ag18 = ag18Res.output;
      resultsArray.ag25 = ag25Res.output;
      resultsArray.ag26 = ag26Res.output;
      resultsArray.allPassed = allPassed;

      return resultsArray;
    } finally {
      for (const tid of issuedTokens) {
        try {
          revoke(tid);
        } catch {}
      }
    }
  },

  /**
   * 2. Unified Live Scholarly & Vault Discovery
   * Queries OpenAlex, Crossref, EuropePMC/PubMed, arXiv, and the project's Knowledge Vault
   * + uploaded primary user datasets. Produces registered tokens [CITE:src_id] / [CITE:user_data_id].
   */
  async retrieveEvidence(options: EvidenceDiscoveryOptions): Promise<UnifiedEvidenceItem[]> {
    const { query, maxResults = 25, vaultSources = [], userDatasets = [] } = options;

    const evidencePool: UnifiedEvidenceItem[] = [];
    const seenKeys = new Set<string>();

    // 1. Ingest Knowledge Vault sources first (highest authority)
    vaultSources.forEach((vSrc, idx) => {
      const srcId = vSrc.id || `src_vault_${idx + 1}`;
      const token = `[CITE:${srcId}]`;
      const authors = Array.isArray(vSrc.authors)
        ? vSrc.authors
        : typeof vSrc.authors === "string"
        ? [vSrc.authors]
        : ["Unknown Author"];

      evidencePool.push({
        id: srcId,
        citationToken: token,
        title: vSrc.title,
        authors,
        year: vSrc.year,
        doi: vSrc.doi,
        url: vSrc.url,
        venue: vSrc.journal,
        sourceType: "vault",
        authorityTier: "A",
        provenance: "Knowledge Vault",
        summary: vSrc.keyFindings,
      });

      if (vSrc.doi) seenKeys.add(vSrc.doi.toLowerCase());
      seenKeys.add(vSrc.title.toLowerCase().replace(/[\W_]+/g, " ").trim());
    });

    // 2. Ingest Primary User Datasets
    userDatasets.forEach((dataset, idx) => {
      const dataId = dataset.id || `user_data_${idx + 1}`;
      const token = `[CITE:${dataId}]`;

      evidencePool.push({
        id: dataId,
        citationToken: token,
        title: dataset.name,
        authors: ["Primary Empirical Dataset"],
        year: new Date().getFullYear(),
        sourceType: "primary_data",
        authorityTier: "A",
        provenance: `User Uploaded Dataset (${dataset.rowCount ? `${dataset.rowCount} records` : "Empirical Data"})`,
        summary: dataset.description || dataset.summary,
      });
    });

    // 3. Live Scholarly Retrieval across OpenAlex, Crossref, arXiv, EuropePMC
    const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
    if (!isTest) {
      try {
      const combinedLive = await cachedLiveDiscovery(query, maxResults);

      let externalCounter = 1;
      for (const draft of combinedLive) {
        const cleanDoi = draft.doi ? draft.doi.toLowerCase().trim() : undefined;
        const normTitle = (draft.title || "").toLowerCase().replace(/[\W_]+/g, " ").trim();

        if (cleanDoi && seenKeys.has(cleanDoi)) continue;
        if (normTitle && seenKeys.has(normTitle)) continue;

        if (cleanDoi) seenKeys.add(cleanDoi);
        if (normTitle) seenKeys.add(normTitle);

        const srcId = `src_ext_${externalCounter++}`;
        const token = `[CITE:${srcId}]`;

        evidencePool.push({
          id: srcId,
          citationToken: token,
          title: draft.title || "Untitled Scholarly Work",
          authors: draft.authors && draft.authors.length > 0 ? draft.authors : ["Anonymous"],
          year: draft.year,
          doi: draft.doi,
          url: draft.url,
          venue: draft.venue,
          sourceType: "scholarly",
          authorityTier: draft.authorityTier === "A" ? "A" : draft.authorityTier === "B" ? "B" : "C",
          provenance: draft.discoveredVia ? `Live ${draft.discoveredVia}` : "Scholarly Discovery",
        });

        if (evidencePool.length >= maxResults + vaultSources.length + userDatasets.length) {
          break;
        }
      }
      } catch {
        // Return vault and user data sources if external portal query encounters network failure
      }
    }

    return evidencePool;
  },

  /**
   * 3. Unified Citation Lock & Chronological Scrubber
   * Replaces hallucinated parentheticals with unverified markers and formats verified [CITE:id]
   * into canonical citation styles (APA 7, IEEE, Harvard, Chicago, MLA 9, Vancouver).
   */
  scrubAndFormatCitations(
    text: string,
    sources: VerifiedSourceItem[],
    style: CitationStyleKey = "apa7",
    dialect: ScholarlyDialect = "en-GB"
  ): UnifiedCitationScrubResult {
    // Scrub hallucinated citations using the core citationLockScrubber
    const scrubbed = scrubCitations(text, sources, { dialect, style: "apa-7" });

    // Look up canonical formatter from registry
    const registry = CitationStyleRegistry.getInstance();
    const styleIdNormalized =
      style === "apa7" ? "apa-7" :
      style === "mla9" ? "mla-9" :
      style === "chicago" ? "chicago-author-date" :
      style;

    const formatter = registry.get(styleIdNormalized) || registry.get("apa-7")!;

    let formattedText = scrubbed.scrubbedText;
    if (style === "ieee" || style === "vancouver") {
      // In IEEE/Vancouver, convert author-date tokens into [1], [2] notation
      scrubbed.citedSources.forEach((s, idx) => {
        const num = idx + 1;
        const authors = Array.isArray(s.authors) ? s.authors : [s.authors];
        const lastNames = authors
          .map((a) => {
            const clean = a.replace(/\bet\sal\.?/gi, "").trim();
            if (clean.includes(",")) return clean.split(",")[0].trim();
            const parts = clean.split(/\s+/).filter(Boolean);
            return parts[parts.length - 1] || clean;
          })
          .filter(Boolean);
        const year = String(s.year).slice(0, 4);
        if (lastNames.length > 0 && year) {
          const authorPattern = lastNames.join("(?:\\s*(?:&|and|;)\\s*|\\s+)");
          const regex = new RegExp(`\\(${authorPattern}[^)]*?,\\s*${year}\\)`, "gi");
          formattedText = formattedText.replace(regex, `[${num}]`);
        }
      });
      formattedText = formattedText.replace(/\[CITE:([^\]]+)\]/gi, (_m, rawId) => {
        const id = rawId.trim();
        const foundIdx = scrubbed.citedSources.findIndex(
          (s) => s.id === id || s.id.toLowerCase() === id.toLowerCase()
        );
        return `[${foundIdx !== -1 ? foundIdx + 1 : 1}]`;
      });
    }

    // Format cited sources into canonical reference list
    const canonicalRefs: CanonicalReference[] = scrubbed.citedSources.map((s, idx) => ({
      kind: "JournalArticle",
      title: s.title,
      source: s.journal || s.title,
      authors: parseAuthorsForCitation(s.authors),
      publicationDate: String(s.year || "n.d."),
      doi: s.doi,
      url: s.url,
    }));

    let bibliographyMarkdown = "";
    try {
      if (style === "ieee") {
        bibliographyMarkdown = canonicalRefs
          .map((ref, i) => `[${i + 1}] ${formatter.formatBibliography(ref)}`)
          .join("\n");
      } else {
        bibliographyMarkdown = formatter.formatReferenceList(canonicalRefs);
      }
    } catch {
      bibliographyMarkdown = canonicalRefs
        .map((r, i) => `${style === "ieee" ? `[${i + 1}] ` : "- "}${r.authors.map((a) => a.lastName).join(", ")} (${r.publicationDate}). *${r.title}*.`)
        .join("\n");
    }

    return {
      ...scrubbed,
      scrubbedText: formattedText,
      formattedText,
      style,
      bibliographyMarkdown,
      referencesLedger: bibliographyMarkdown,
      hallucinatedCitationsStripped: scrubbed.strippedCitations,
    };
  },

  /**
   * 4. Unified Voice & Style Engine
   * Normalizes Unicode to NFC, converts American to British English, suppresses clichés,
   * preserves IAST diacritics, and calculates burstiness telemetry.
   */
  enforceScholarlyVoice(
    text: string,
    options: { dialect?: ScholarlyDialect; stripCliches?: boolean; lockedTerms?: string[] } = {}
  ): {
    text: string;
    wordCount: number;
    burstinessMetrics: ScholarBrainBurstinessMetrics;
  } {
    const dialect = options.dialect ?? "en-GB";
    const sanitized = sanitizeScholarlyText(text, {
      dialect,
      stripCliches: options.stripCliches ?? true,
    });
    const normalized = normalizeUnicodeNFC(sanitized);
    const wordCount = countExactWords(normalized);
    const burstinessMetrics = evaluateBurstiness(normalized);

    return {
      text: normalized,
      wordCount,
      burstinessMetrics,
    };
  },

  /**
   * 5. Deterministic Mark-Weighted Word Allocator
   * Partitions total word count across questions based on marks, percentages, or subpart complexity.
   */
  /**
   * Presentation Studio (OT-22): the card-by-card outline for an uploaded
   * brief or a topic. Returns the model's JSON (validated by the route).
   */
  async presentationOutline(options: {
    req: ScholarBrainAiRequestLike;
    material: string;
    topic?: string;
    slideCount: number;
    visualTypes: readonly string[];
    instruction?: string;
    current?: Array<{ title: string; bullets: string[] }>;
  }): Promise<unknown> {
    const systemPrompt = `You plan presentation outlines in the style of Gamma: one idea per card, each card a visual.
Write EXACTLY ${options.slideCount} cards for the material, in presentation order: a title card first, a key-takeaways card last.

Rules:
- "title" of the deck: the real topic of the material (for example "Branches of Quantum Computing: Assessment & Architectural Framework"). Never an institution banner such as "DEPARTMENT OF ...", never a module or course code, never "-4020"-style numbers.
- Every card: a short assertion or topic title (max 10 words), a "visualType" from this list: ${options.visualTypes.map((v) => `"${v}"`).join(", ")}, and 3-4 "bullets" (max 14 words each) that say what the card covers.
- Cover every question or section in the material; never drop one. Use only content that is in the material; never invent figures, quotations or citations.
- Vary visualType across the deck; use "2-Column Comparison" for comparisons and "Process / Timeline" for sequences.
Output strict JSON only: {"title":"...","slides":[{"title":"...","visualType":"...","bullets":["..."]}]}`;
    const userPrompt = [
      options.topic ? `Topic: ${options.topic}` : "",
      options.instruction ? `Change requested by the presenter: ${options.instruction}` : "",
      options.current?.length ? `Current outline:\n${options.current.map((c, i) => `${i + 1}. ${c.title}: ${c.bullets.join("; ")}`).join("\n")}` : "",
      options.material ? `Material:\n${options.material.slice(0, 20000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const res = await scholarBrain.complete({ req: options.req, browserFallback: true, taskClass: "verification", systemPrompt, userPrompt, responseFormat: "json" });
    return res.parsedJson ?? (res.text ? parseAndRepairLLMJson(res.text) : null);
  },

  /** Write one block of a slide (Presentation Studio "Write with AI"). */
  async writeSlideBlock(options: {
    req: ScholarBrainAiRequestLike;
    kind: string;
    slideTitle: string;
    context: string;
    existing?: string;
  }): Promise<unknown> {
    const systemPrompt = `You write one block of a presentation slide using assertion-evidence design.
Block kind: ${options.kind}. Write a "title" (max 8 words, an assertion not a topic) and a "body" (15-30 words, concrete, scannable, no filler or clichés).
Use only what the slide context supports; never invent figures, quotations or citations. If the context has no figure, do not write one.
Output strict JSON only: {"title":"...","body":"..."}`;
    const userPrompt = `Slide: ${options.slideTitle}\nContext:\n${options.context.slice(0, 4000)}${options.existing ? `\nCurrent text: ${options.existing}` : ""}`;
    const res = await scholarBrain.complete({ req: options.req, browserFallback: true, taskClass: "verification", systemPrompt, userPrompt, responseFormat: "json" });
    return res.parsedJson ?? (res.text ? parseAndRepairLLMJson(res.text) : null);
  },

  allocateWordsByMarks(
    questions: Array<BriefQuestionInput | string>,
    totalWordBudget: number
  ): MarkAllocationResult {
    return allocateWordsByMarks(questions, totalWordBudget);
  },

  /**
   * Helper to parse mark values from question titles or text.
   */
  parseQuestionMarks(text: string): number | undefined {
    return parseQuestionMarks(text);
  },

  /**
   * Helper to format exclusive citation ledger for AI prompts.
   */
  formatCitationLedger(sources: VerifiedSourceItem[]) {
    return formatCitationLedger(sources);
  },
};

export default scholarBrain;
