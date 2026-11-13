import express, { Request, Response } from "express";
import { requireAuth } from "../src/middleware/auth.ts";
import { readVerifiedBrowserResult, signLlmChallenge, computePromptHash } from "../src/services/scholarBrain.ts";
import { requestKeyring } from "../src/ai/routerBridge.ts";
import { InvalidLlmChallengeError, LocalModelUnreachableError, NoClientAiProviderError, sendAiFailure } from "../src/ai/aiRouteErrors.ts";
import { aiAvailability, answeredByLabel, routedCompletion } from "../src/ai/routerBridge.ts";
import type { ResearchLlm } from "../src/research/deepResearchEngine.ts";
import { executeWebSearch, formatSearchResultsForPrompt, type SearchResultItem } from "../src/research/webSearchEngine.ts";
import { executeDeepResearch, DeepResearchBrowserHandOffError } from "../src/research/deepResearchEngine.ts";
import { safeFetchHtml } from "../utils/ssrfGuard.ts";
import { validateAndRefineCitations } from "../src/research/citationValidator.ts";
import type { CitationStyleRegistry } from "../../src/citation_compliance/formattingEngine.ts";
import type { CanonicalReference } from "../../src/citation_compliance/model/reference.ts";
import {
  detectDeliverableIntent,
  isSubstantiveAcademicQuery,
  buildGroundedAskScholarSystemPrompt,
  type GroundedScholarSource,
} from "../src/research/scholarlyRetrievalPipeline.ts";
import {
  scholarBrain,
  type UnifiedEvidenceItem,
  type CitationStyleKey,
} from "../src/services/scholarBrain.ts";
import type { VerifiedSourceItem } from "../src/utils/citationLockScrubber.ts";
import { countExactWords } from "../src/utils/wordBudgetAllocator.ts";
import { evaluateBurstiness } from "../src/utils/scholarlyVoiceGuard.ts";
import { chunkAndRerankEvidence } from "../src/services/semanticRagEngine.ts";
import { decideAskMode } from "../../src/shared/askRouting.ts";
import { ASK_BASE_IDENTITY, askStyleDescription } from "../../src/shared/askPrompts.ts";
import { deleteThread, listThreads, parseThreads, saveThreads } from "../src/askThreads/threadStore.ts";

/** Deep research runs each of its AI steps through the request's router chain. */
const researchLlm = (req: Request): ResearchLlm => (systemPrompt, userPrompt, _format, images) =>
  routedCompletion(req, {
    task: "reasoning",
    systemPrompt,
    userPrompt,
    images: images?.filter((i) => i.data).map((i) => ({ mediaType: i.mimeType ?? "image/jpeg", data: i.data as string })),
  });

/**
 * Ask Scholar's live web search, cached per query for 20 minutes so a request
 * retried after the browser-AI hand-off (426) rebuilds the identical prompt and
 * its challenge matches. A failed search is not cached.
 */
const ASK_SEARCH_TTL_MS = 20 * 60 * 1000;
const askSearchCache = new Map<string, { at: number; value: Promise<Awaited<ReturnType<typeof executeWebSearch>>> }>();
function cachedAskScholarWebSearch(query: string, maxResults?: number): Promise<Awaited<ReturnType<typeof executeWebSearch>>> {
  const key = `${query.trim().toLowerCase()}::${maxResults ?? "adaptive"}`;
  const hit = askSearchCache.get(key);
  if (hit && Date.now() - hit.at < ASK_SEARCH_TTL_MS) return hit.value;
  const value = executeWebSearch(query, { maxResults, fetchFullContent: true });
  value.catch(() => askSearchCache.delete(key));
  askSearchCache.set(key, { at: Date.now(), value });
  if (askSearchCache.size > 200) {
    const oldest = askSearchCache.keys().next().value;
    if (oldest !== undefined) askSearchCache.delete(oldest);
  }
  return value;
}

const fullTextPassageCache = new Map<string, { at: number; snippet: string }>();

function extractPlainTextFromHtml(html: string, maxLength = 7500): string {
  if (!html) return "";
  const cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function normalizePreRetrievedSources(raw: unknown): SearchResultItem[] {
  if (!Array.isArray(raw)) return [];
  const items: SearchResultItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, any>;
    const title = String(rec.title || "").trim();
    if (!title || title.length < 4) continue;
    const rawAuthors = Array.isArray(rec.authors)
      ? rec.authors.map((a: unknown) => String(a || "").trim()).filter(Boolean)
      : typeof rec.author === "string" && rec.author.trim()
      ? [rec.author.trim()]
      : [];
    const filteredAuthors = rawAuthors.filter((a: string) => !/^unknown(\s+author)?$/i.test(a));
    const venue = String(rec.venue || rec.journal || rec.publisher || "").trim();
    const rawYear = rec.year !== undefined && rec.year !== null ? String(rec.year).trim() : "";
    const validYear = /^(18|19|20)\d{2}$/.test(rawYear) ? rawYear : "";
    if (filteredAuthors.length === 0 && !venue) continue;
    if (!validYear) continue;
    const doi = typeof rec.doi === "string" && rec.doi.trim() ? rec.doi.trim() : undefined;
    const url =
      (typeof rec.openAccessUrl === "string" && rec.openAccessUrl.trim()) ||
      (typeof rec.url === "string" && rec.url.trim()) ||
      (doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : "");
    if (!url) continue;
    let domain = "scholarly.source";
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    const snippet = String(rec.snippet || rec.abstract || "").trim() || `${title} (${venue || domain}, ${validYear}).`;
    items.push({
      title,
      url,
      snippet,
      domain,
      publisher: venue || domain,
      venue: venue || domain,
      sourceType: (rec.sourceType as any) || "scholarly",
      authorityTier: "A",
      authorityBadge: String(rec.authorityBadge || rec.provider || "Peer-Reviewed Literature"),
      score: Number(rec.authorityScore || rec.score || 92),
      publishedDate: validYear,
      year: Number(validYear),
      author: filteredAuthors[0] || venue,
      authors: filteredAuthors.length > 0 ? filteredAuthors : [venue],
      doi,
      isPrimary: true,
    });
  }
  return items;
}

async function enrichTopSourcesWithFullText(
  sources: SearchResultItem[],
  query: string
): Promise<SearchResultItem[]> {
  if (!Array.isArray(sources) || sources.length === 0) return sources;
  const enriched = [...sources];
  const candidateIndices: number[] = [];
  for (let i = 0; i < Math.min(enriched.length, 6); i++) {
    const s = enriched[i];
    if (s && s.url && /^https?:\/\//i.test(s.url) && (!s.snippet || s.snippet.length < 340)) {
      candidateIndices.push(i);
      if (candidateIndices.length >= 3) break;
    }
  }
  if (candidateIndices.length === 0) return enriched;

  await Promise.all(
    candidateIndices.map(async (idx) => {
      const src = enriched[idx];
      const cacheKey = `${src.url}::${query.trim().toLowerCase().slice(0, 80)}`;
      const cached = fullTextPassageCache.get(cacheKey);
      if (cached && Date.now() - cached.at < ASK_SEARCH_TTL_MS) {
        enriched[idx] = { ...src, snippet: cached.snippet };
        return;
      }
      try {
        const fetched = await safeFetchHtml(src.url, { timeoutMs: 3200 });
        if (!fetched?.body) return;
        const plain = extractPlainTextFromHtml(fetched.body, 7500);
        if (!plain || plain.length < 240) return;
        const rag = chunkAndRerankEvidence(query, [{ name: src.title, text: plain }], 1800);
        const bestPassage =
          rag.chunks.length > 0
            ? rag.chunks.map((c) => c.text).join(" … ").slice(0, 1800)
            : plain.slice(0, 1800);
        if (bestPassage.length > (src.snippet || "").length) {
          fullTextPassageCache.set(cacheKey, { at: Date.now(), snippet: bestPassage });
          enriched[idx] = { ...src, snippet: bestPassage };
        }
      } catch {
        // Keep existing abstract/snippet if server full-text fetch times out or is blocked
      }
    })
  );
  return enriched;
}

/**
 * Intelligent Capability Determination:
 * Analyzes prompt content, attachments, and explicit mode to choose the optimal workflow.
 */
function determineExecutionMode(
  prompt: string,
  explicitMode?: string,
  hasFiles?: boolean,
  hasImages?: boolean,
  hasVaultSources?: boolean
): "chat" | "search" | "deep-research" {
  return decideAskMode({ query: prompt, requestedMode: explicitMode, hasFiles, hasImages, hasVaultSources });
}

export function registerAIRoutes(
  app: express.Express,
  aiAbuseLimit?: express.RequestHandler,
  _citationStyleRegistry?: CitationStyleRegistry
): void {
  const router = express.Router();

  /**
   * GET /api/ai/status
   * Unified, single source of truth for AI operational status.
   */
  router.get("/status", async (req: Request, res: Response) => {
    try {
      const ring = await requestKeyring(req as never);
      const operational = ring.length > 0;
      const isLocal = (provider: string) => provider === "ollama" || provider === "lmstudio";

      const providers = ring.map((e) => ({
        id: e.provider,
        name: e.label ?? e.provider,
        model: e.model,
        tier: isLocal(e.provider) ? "local" : "byok",
        capabilities: e.provider === "google" ? ["text", "vision", "reasoning", "multimodal"] : ["text", "reasoning"],
        status: "active",
      }));

      res.json({
        ok: true,
        connected: operational,
        operational,
        serverAvailable: operational,
        tier: "byok",
        configured: operational,
        serverSponsoredAi: false,
        providers,
        activeRoute: ring[0]?.provider || null,
        activeModel: ring[0]?.model || null,
        capabilities: {
          text: operational,
          vision: operational && ring.some((e) => e.provider === "google" || e.provider === "openai" || e.provider === "anthropic"),
          document: true,
          webSearch: true,
          deepResearch: operational,
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        connected: false,
        operational: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  if (aiAbuseLimit) {
    router.use(aiAbuseLimit);
  }

  /**
   * POST /api/ai/search
   * Dedicated Web Search endpoint.
   */
  router.post("/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { query, maxResults = 5 } = req.body || {};
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing required query string" });
      }

      const [webResults, scholarEvidence] = await Promise.all([
        executeWebSearch(query, { maxResults: Number(maxResults) || 5, fetchFullContent: true }),
        scholarBrain.retrieveEvidence({ query, maxResults: Number(maxResults) || 5 }).catch(() => []),
      ]);
      res.json({ ok: true, ...webResults, evidence: scholarEvidence });
    } catch (err) {
      res.status(500).json({ error: `Web search failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  /**
   * POST /api/ai/deep-research
   * Dedicated Deep Research pipeline with full document, image, and 426 browser-LLM hand-off support.
   */
  router.post("/deep-research", requireAuth, async (req: Request, res: Response) => {
    try {
      const {
        topic,
        files = [],
        images = [],
        vaultSources = [],
        citationStyle = "apa",
        approvedSubQuestions,
        preRetrievedSources,
      } = req.body || {};
      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ error: "Missing required topic string" });
      }
      const hasBrowserResult = req.body?.llmResult !== undefined && req.body?.llmResult !== null;
      const where = await aiAvailability(req, "reasoning").catch(() => "server" as const);
      if (where === "none" && !hasBrowserResult) {
        return sendAiFailure(res, new NoClientAiProviderError(), "Deep research");
      }

      const makeChallengeToken = (sysPrompt: string, uPrompt: string): string => {
        const userId = (req as any)?.user?.id || "anonymous";
        const routeId = req.originalUrl || req.url || "/api/ai/deep-research";
        return signLlmChallenge({
          userId: String(userId),
          routeId: String(routeId),
          promptHash: computePromptHash(sysPrompt, uPrompt),
          expiresAt: Date.now() + 15 * 60 * 1000,
        });
      };

      const [evidence] = await Promise.all([
        scholarBrain.retrieveEvidence({ query: topic, maxResults: 15, vaultSources }).catch(() => []),
      ]);

      const normalizedImages = (images || []).map((img: any) => {
        const raw = img.dataUrl || img.data || "";
        const mimeType =
          img.mimeType ||
          (raw.startsWith("data:")
            ? raw.split(";")[0].replace("data:", "")
            : "image/jpeg");
        const base64 = raw.includes(";base64,") ? raw.split(";base64,")[1] : raw;
        const dataUrl = raw.startsWith("data:") ? raw : `data:${mimeType};base64,${base64}`;
        return {
          name: img.name || "image",
          mimeType,
          data: base64,
          dataUrl,
        };
      });

      const normalizedPreRetrieved = normalizePreRetrievedSources(preRetrievedSources);
      let result;
      try {
        result = await executeDeepResearch(
          topic,
          researchLlm(req),
          undefined,
          files,
          normalizedImages,
          Array.isArray(vaultSources) ? vaultSources : [],
          String(citationStyle || "apa"),
          {
            approvedSubQuestions: Array.isArray(approvedSubQuestions) ? approvedSubQuestions : undefined,
            preRetrievedSources: normalizedPreRetrieved,
            forceBrowserHandOff: !hasBrowserResult && where === "browser",
            verifyAndReadBrowserResult: hasBrowserResult
              ? (sys, usr) => readVerifiedBrowserResult(req, sys, usr)
              : undefined,
          }
        );
      } catch (deepErr) {
        if (deepErr instanceof DeepResearchBrowserHandOffError) {
          return res.status(426).json({
            requireFrontendLLM: true,
            challengeToken: makeChallengeToken(deepErr.systemPrompt, deepErr.userPrompt),
            systemPrompt: deepErr.systemPrompt,
            userPrompt: deepErr.userPrompt,
            taskType: "reasoning",
            mode: "deep-research",
            citations: deepErr.allCitations,
            plan: deepErr.plan,
            researchPlan: deepErr.researchPlan,
            stages: deepErr.stages,
            evidence: deepErr.evidence,
            citationStyle: String(citationStyle || "apa"),
          });
        }
        throw deepErr;
      }

      const verifiedSources: VerifiedSourceItem[] = evidence
        .filter((e) => e.authors && e.authors.length > 0 && e.year)
        .map((e) => ({
          id: e.id,
          authors: e.authors,
          year: String(e.year),
          title: e.title,
          doi: e.doi,
          url: e.url,
          journal: e.venue,
        }));

      const hasCiteTokens = /\[CITE:[^\]]+\]/i.test(result.synthesizedReport);
      const scrubbed = hasCiteTokens
        ? scholarBrain.scrubAndFormatCitations(
            result.synthesizedReport,
            verifiedSources,
            "apa7",
            "en-GB"
          )
        : null;

      const finalReport = scrubbed && scrubbed.citedSources.length > 0 ? scrubbed.formattedText : result.synthesizedReport;

      res.json({
        ok: true,
        ...result,
        synthesizedReport: finalReport,
        text: finalReport,
        wordCount: countExactWords(finalReport),
        verifiedSourcesCount: Math.max(scrubbed?.citedSources.length ?? 0, (result.allCitations || []).length),
        evidence,
      });
    } catch (err) {
      sendAiFailure(res, err, "Deep research");
    }
  });

  /**
   * POST /api/ai/agent
   * Primary unified research agent endpoint:
   * Handles text, files, images, web search, deep research, conversation context, and failover.
   */
  router.post("/agent", requireAuth, async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        systemPrompt = ASK_BASE_IDENTITY,
        history = [],
        files = [],
        images = [],
        mode: requestedMode,
        citationStyle = "apa",
      } = req.body || {};

      if (!prompt && (!files || files.length === 0) && (!images || images.length === 0)) {
        return res.status(400).json({ error: "Empty prompt or query supplied." });
      }

      const makeChallengeToken = (sysPrompt: string, uPrompt: string): string => {
        const userId = (req as any)?.user?.id || "anonymous";
        const routeId = req.originalUrl || req.url || "/api/ai/chat";
        return signLlmChallenge({
          userId: String(userId),
          routeId: String(routeId),
          promptHash: computePromptHash(sysPrompt, uPrompt),
          expiresAt: Date.now() + 15 * 60 * 1000,
        });
      };

      // A browser-run answer (after a 426 hand-off) is verified only once this
      // request's prompt is rebuilt, so the challenge is checked against it.
      const hasBrowserResult = req.body?.llmResult !== undefined && req.body?.llmResult !== null;
      let incomingLlmResult: string | null = null;
      // Normalize images so dataUrl and base64 data are reliably present
      const normalizedImages = (images || []).map((img: any) => {
        const raw = img.dataUrl || img.data || "";
        const mimeType =
          img.mimeType ||
          (raw.startsWith("data:")
            ? raw.split(";")[0].replace("data:", "")
            : "image/jpeg");
        const base64 = raw.includes(";base64,") ? raw.split(";base64,")[1] : raw;
        const dataUrl = raw.startsWith("data:") ? raw : `data:${mimeType};base64,${base64}`;
        return {
          name: img.name || "image",
          mimeType,
          data: base64,
          dataUrl,
        };
      });

      const effectivePrompt = (
        prompt ||
        (normalizedImages.length > 0 && files.length > 0
          ? "Analyze the attached image and document."
          : normalizedImages.length > 0
          ? "Analyze and explain the attached image."
          : "Analyze and summarize the attached document.")
      ).trim();

      const deliverableIntent = detectDeliverableIntent(effectivePrompt);
      const isSubstantive = isSubstantiveAcademicQuery(effectivePrompt) || deliverableIntent !== null;
      const mode = determineExecutionMode(
        effectivePrompt,
        requestedMode,
        files.length > 0,
        normalizedImages.length > 0,
        Array.isArray(req.body?.vaultSources) && req.body.vaultSources.length > 0
      );
      const cleanStyle = (citationStyle || "apa").toLowerCase();

      const vaultSources = Array.isArray(req.body?.vaultSources) ? req.body.vaultSources : [];
      const hasExplicitCanonical = Array.isArray(req.body?.canonicalSources) && req.body.canonicalSources.length > 0;
      const isExplicitNormalChat =
        requestedMode === "normal" ||
        (requestedMode === "chat" && vaultSources.length === 0 && !hasExplicitCanonical);
      const useStrictVaultLedger =
        !isExplicitNormalChat &&
        mode !== "search" &&
        mode !== "deep-research" &&
        (vaultSources.length > 0 || hasExplicitCanonical);

      // ── Canonical Scholarly Ingestion (OpenAlex, Crossref, Vault) via scholarBrain ──
      let canonicalSources: GroundedScholarSource[] = [];
      let unifiedEvidence: UnifiedEvidenceItem[] = [];
      if (hasExplicitCanonical) {
        canonicalSources = req.body.canonicalSources;
      } else if (useStrictVaultLedger || (mode === "search" && vaultSources.length > 0)) {
        try {
          unifiedEvidence = await scholarBrain.retrieveEvidence({
            query: effectivePrompt,
            maxResults: 8,
            vaultSources,
          });

          canonicalSources = unifiedEvidence.map((e) => {
            const authorKeys = e.authors
              .map((a) => {
                const parts = a.trim().split(" ");
                return (parts[parts.length - 1] || a).toLowerCase().replace(/[^a-z]/g, "");
              })
              .filter(Boolean);

            const canonicalRef: CanonicalReference = {
              kind: "JournalArticle",
              title: e.title,
              source: e.venue || "",
              authors: e.authors.map((a, i) => {
                const parts = a.trim().split(" ");
                return {
                  firstName: parts.slice(0, -1).join(" "),
                  lastName: parts[parts.length - 1] || a,
                  order: i + 1,
                };
              }),
              publicationDate: e.year ? String(e.year) : undefined,
              doi: e.doi,
              url: e.url,
            };

            return {
              id: e.id,
              title: e.title,
              authors: e.authors,
              year: e.year,
              doi: e.doi,
              url: e.url,
              venue: e.venue,
              sourceType: e.sourceType === "vault" ? ("vault" as const) : ("scholarly" as const),
              canonicalReference: canonicalRef,
              inTextCitation: e.citationToken,
              authorKeys,
            };
          });
        } catch (err) {
          console.warn("Scholarly canonical retrieval warning:", err);
          canonicalSources = [];
        }
      }

      // ── Workflow: Deep Research Mode ──
      const approvedSubQuestions = Array.isArray(req.body?.approvedSubQuestions)
        ? req.body.approvedSubQuestions
        : undefined;
      const normalizedPreRetrieved = await enrichTopSourcesWithFullText(
        normalizePreRetrievedSources(req.body?.preRetrievedSources),
        effectivePrompt
      );
      const answerLength = String(req.body?.answerLength || "standard").toLowerCase();

      if (mode === "deep-research") {
        const where = await aiAvailability(req, "reasoning").catch(() => "server" as const);
        const wantsSse =
          where === "server" &&
          !hasBrowserResult &&
          typeof req.headers.accept === "string" &&
          req.headers.accept.includes("text/event-stream");

        if (wantsSse) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
        }

        try {
          const research = await executeDeepResearch(
            effectivePrompt,
            researchLlm(req),
            wantsSse
              ? (status, stage) => {
                  try {
                    res.write(`data: ${JSON.stringify({ type: "stage", status, stage })}\n\n`);
                  } catch {
                    // ignore stream write errors
                  }
                }
              : undefined,
            files,
            normalizedImages,
            vaultSources,
            cleanStyle,
            {
              approvedSubQuestions,
              preRetrievedSources: normalizedPreRetrieved,
              forceBrowserHandOff: !hasBrowserResult && where !== "server",
              verifyAndReadBrowserResult: hasBrowserResult
                ? (sys, usr) => readVerifiedBrowserResult(req, sys, usr)
                : undefined,
            }
          );
          const cleanReport = research.synthesizedReport.replace(/\s*\[CITE:[^\]]+\]/gi, "");
          const exactWordCount = countExactWords(cleanReport);
          const burstiness = evaluateBurstiness(cleanReport);
          const finalPayload = {
            ok: true,
            mode: "deep-research",
            text: cleanReport,
            plan: research.plan,
            researchPlan: research.researchPlan,
            stages: research.stages,
            evidence: research.evidence,
            citations: research.allCitations,
            followUps: research.followUps,
            provider: hasBrowserResult ? "byok" : answeredByLabel(req),
            model: hasBrowserResult ? "client-router" : answeredByLabel(req),
            citationStyle: cleanStyle,
            wordCount: exactWordCount,
            verifiedSourcesCount: (research.allCitations || []).length,
            burstinessMetrics: burstiness,
            recommendedWorkspaceHandoff: deliverableIntent,
          };
          if (wantsSse) {
            res.write(`data: ${JSON.stringify({ type: "complete", payload: finalPayload })}\n\n`);
            return res.end();
          }
          return res.json(finalPayload);
        } catch (deepErr: unknown) {
          if (deepErr instanceof DeepResearchBrowserHandOffError) {
            return res.status(426).json({
              requireFrontendLLM: true,
              challengeToken: makeChallengeToken(deepErr.systemPrompt, deepErr.userPrompt),
              systemPrompt: deepErr.systemPrompt,
              userPrompt: deepErr.userPrompt,
              taskType: "reasoning",
              mode: "deep-research",
              citations: deepErr.allCitations,
              plan: deepErr.plan,
              researchPlan: deepErr.researchPlan,
              stages: deepErr.stages,
              evidence: deepErr.evidence,
              canonicalSources,
              deliverableIntent,
              citationStyle: cleanStyle,
            });
          }
          if (deepErr instanceof InvalidLlmChallengeError) {
            throw deepErr;
          }
          return sendAiFailure(res, deepErr, "Deep research");
        }
      }

      // ── Context Assembly: Files, Images, Canonical Ledger & Web Search ──
      let contextBlocks: string[] = [];

      // 1. Process Uploaded Documents with Semantic RAG Paragraph Chunking & BM25 Reranking
      if (files && files.length > 0) {
        const ragResult = chunkAndRerankEvidence(effectivePrompt, files, 4000);
        if (ragResult.chunks.length > 0) {
          contextBlocks.push(ragResult.formattedContext);
        }
      }

      // 1.5 Process Uploaded Images Metadata
      if (normalizedImages && normalizedImages.length > 0) {
        const imgDetails = normalizedImages.map((img: any, i: number) => `Attachment ${i + 1}: "${img.name}" (${img.mimeType})`).join(", ");
        contextBlocks.push(`=== VISUAL MEDIA ATTACHMENTS ===\nThe user has attached ${normalizedImages.length} image(s): ${imgDetails}.\nThe image payload is delivered directly to your vision pipeline for detailed visual inspection.\n=== END OF VISUAL MEDIA ATTACHMENTS ===`);
      }

      // 2. Canonical Citation Ledger Context Block (when operating in strict Vault/Canonical ledger mode)
      if (useStrictVaultLedger && canonicalSources.length > 0) {
        const verifiedCanonical = canonicalSources.filter((s) => s.authors && s.authors.length > 0 && s.year);
        if (verifiedCanonical.length > 0) {
          contextBlocks.push(
            `=== RETRIEVED CANONICAL SCHOLARLY SOURCES (EXCLUSIVE CITATION LEDGER) ===\n` +
            verifiedCanonical
              .map(
                (s, idx) =>
                  `[Source ${idx + 1}] (${s.id}) In-Text Citation: ${s.inTextCitation}\nTitle: "${s.title}"\nAuthors: ${s.authors.join(", ")}\nYear: ${s.year}\nDOI: ${s.doi || "None"}\nVenue/Publisher: ${s.venue || "Academic Repository"}\nURL: ${s.url || "N/A"}`
              )
              .join("\n\n") +
            `\n=== END OF EXCLUSIVE CITATION LEDGER ===`
          );
        }
      }

      let citations: any[] = [];

      // 3. Process Web & Scholarly Search (Reusing preRetrievedSources from client when present to eliminate duplicate retrieval)
      if (mode === "search") {
        const vaultMapped = canonicalSources
          .filter((s) => s.sourceType === "vault" && s.authors && s.authors.length > 0 && s.year)
          .map((s) => ({
            title: s.title,
            url: s.url || (s.doi ? `https://doi.org/${s.doi}` : `#vault-${s.id}`),
            doi: s.doi,
            snippet: "",
            venue: s.venue || "Knowledge Vault",
            year: String(s.year),
            authors: s.authors,
            authorityBadge: "Knowledge Vault",
            isPrimary: true,
            sourceType: "vault" as const,
            authorityScore: 98,
          }));
        if (normalizedPreRetrieved.length > 0) {
          citations = [...vaultMapped, ...normalizedPreRetrieved];
        } else {
          const searchResponse = await cachedAskScholarWebSearch(effectivePrompt);
          const enrichedWeb = await enrichTopSourcesWithFullText(searchResponse.results || [], effectivePrompt);
          citations = [...vaultMapped, ...enrichedWeb];
        }
        contextBlocks.push(`=== LIVE VERIFIED WEB, INSTITUTIONAL & SCHOLARLY SEARCH RESULTS ===\n${formatSearchResultsForPrompt(citations)}\n=== END OF SEARCH RESULTS ===`);
      } else if (isExplicitNormalChat && vaultSources.length > 0) {
        citations = vaultSources
          .filter((v: any) => v && v.title && (Array.isArray(v.authors) ? v.authors.length > 0 : Boolean(v.author)) && v.year)
          .map((v: any, idx: number) => ({
            title: v.title || `Vault Source ${idx + 1}`,
            url: v.url || (v.doi ? `https://doi.org/${v.doi}` : `#vault-${idx + 1}`),
            doi: v.doi,
            snippet: v.snippet || v.notes || v.abstract || "",
            venue: v.venue || v.journal || "Knowledge Vault",
            year: String(v.year),
            authors: Array.isArray(v.authors) ? v.authors : [String(v.author)],
            authorityBadge: "Knowledge Vault",
            isPrimary: true,
            sourceType: "vault" as const,
          }));
        if (citations.length > 0) {
          contextBlocks.push(`=== INTERNAL KNOWLEDGE VAULT CONTEXT ===\n${formatSearchResultsForPrompt(citations)}\n=== END OF KNOWLEDGE VAULT CONTEXT ===`);
        }
      }
      if (citations.length === 0 && normalizedPreRetrieved.length > 0) {
        citations = normalizedPreRetrieved;
        contextBlocks.push(`=== VERIFIED SCHOLARLY & WEB EVIDENCE ===\n${formatSearchResultsForPrompt(citations)}\n=== END OF VERIFIED EVIDENCE ===`);
      }

      // 4. Assemble Conversation History
      let conversationHistoryText = "";
      if (history && history.length > 0) {
        conversationHistoryText = "Prior Conversation Context:\n";
        for (const msg of history.slice(-6)) {
          conversationHistoryText += `${msg.role === "user" ? "User" : "Scholar Core"}: ${msg.content}\n`;
        }
        conversationHistoryText += "\n";
      }

      const styleDescription = askStyleDescription(cleanStyle);

      // 5. Build Mode-Specific System Prompt (prompt text lives in scholarBrain)
      let effectiveSystemPrompt = systemPrompt;
      if (useStrictVaultLedger && (isSubstantive || canonicalSources.length > 0)) {
        effectiveSystemPrompt = buildGroundedAskScholarSystemPrompt(canonicalSources, deliverableIntent, cleanStyle);
      } else if (mode === "search") {
        effectiveSystemPrompt = scholarBrain.askSystemPrompt({ kind: "search", style: cleanStyle, length: answerLength });
      } else {
        effectiveSystemPrompt = scholarBrain.askSystemPrompt({ kind: "general", base: systemPrompt, style: cleanStyle, length: answerLength });
      }

      let assembledUserPrompt = "";
      if (conversationHistoryText) {
        assembledUserPrompt += conversationHistoryText + "\n";
      }
      if (contextBlocks.length > 0) {
        assembledUserPrompt += contextBlocks.join("\n\n") + "\n\n";
      }

      if (files.length > 0 && normalizedImages.length > 0) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nCarefully inspect both the attached visual image(s) and uploaded document(s) above. Directly answer the user's inquiry integrating insights from both the visual evidence and textual content.`;
      } else if (normalizedImages.length > 0) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nCarefully examine the attached image(s) above. Directly describe, analyze, and answer the user's inquiry based on the visual contents, details, structures, and any text visible within the image(s).`;
      } else if (files.length > 0 && mode === "search") {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nNote: You have access to both the user's uploaded document(s) and live verified search findings. Clearly distinguish facts derived from the uploaded file from facts obtained via external sources. Ground external facts in the retrieved sources using ${styleDescription}.`;
      } else if (files.length > 0) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nAnalyze the uploaded document above and directly answer the user's inquiry based on the document text.`;
      } else if (useStrictVaultLedger && (isSubstantive || canonicalSources.length > 0)) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nDeliver an authoritative, research-grounded synthesis. Strict requirements:\n1. Only cite sources from the Exclusive Citation Ledger above using verified [CITE:id] tokens.\n2. Do NOT fabricate authors, years, or citations not in the ledger.\n3. State plainly when a statistic has no verified source in the ledger instead of citing it. Never write a tag such as [Unverified Claim] into the prose.\n4. Do NOT output fake word count declarations.`;
      } else if (mode === "search") {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nSynthesize a rigorous, well-verified academic answer using the retrieved sources above.

Formatting & Verification Rules:
1. Direct Answer First: Open with a direct answer, develop the supporting argument in synthesized analytical prose (avoiding bullet-point dumps), and note methodological or evidence limitations.
2. Accurate In-Text Citations: Cite only the relevant retrieved sources above where they support a specific claim, grouping sources that support the same point. Ignore any retrieved source that is off-topic.
3. Cross-Verification: Compare and contrast perspectives where studies or institutional reports diverge.
4. Zero Fabrication: Never invent citations, DOIs, URLs, or placeholder metadata ("Unknown Author", "n.d.").
5. Conclude with a "## References" section formatted in ${styleDescription} with strict 1-to-1 correspondence between in-text citations and reference entries.`;
      } else {
        assembledUserPrompt += effectivePrompt;
      }

      if (hasBrowserResult && incomingLlmResult === null) {
        incomingLlmResult = readVerifiedBrowserResult(req, effectiveSystemPrompt, assembledUserPrompt);
      }

      // 6. Execute Agent with Multimodal & Model Failover Support
      if (!incomingLlmResult && (await aiAvailability(req, normalizedImages.length > 0 ? "vision" : "drafting").catch(() => "server" as const)) !== "server") {
        return res.status(426).json({
          requireFrontendLLM: true,
          challengeToken: makeChallengeToken(effectiveSystemPrompt, assembledUserPrompt),
          systemPrompt: effectiveSystemPrompt,
          userPrompt: assembledUserPrompt,
          taskType: normalizedImages && normalizedImages.length > 0 ? "chat" : "reasoning",
          mode,
          canonicalSources,
          deliverableIntent,
          citationStyle: cleanStyle,
        });
      }

      const wantsStream = req.headers.accept?.includes("text/event-stream") || req.query.stream === "true";
      if (wantsStream && (!normalizedImages || normalizedImages.length === 0)) {
        await scholarBrain.stream(
          req,
          {
            systemPrompt: effectiveSystemPrompt,
            userPrompt: assembledUserPrompt,
            taskClass: "drafting",
          },
          res
        );
        return;
      }

      let result: { text: string; provider: string; model: string };
      if (incomingLlmResult) {
        result = {
          text: incomingLlmResult,
          provider: "byok",
          model: "client-router",
        };
      } else {
        const chatHandOff = () => res.status(426).json({
          requireFrontendLLM: true,
          challengeToken: makeChallengeToken(effectiveSystemPrompt, assembledUserPrompt),
          systemPrompt: effectiveSystemPrompt,
          userPrompt: assembledUserPrompt,
          taskType: normalizedImages && normalizedImages.length > 0 ? "chat" : "reasoning",
          mode,
          canonicalSources,
          deliverableIntent,
          citationStyle: cleanStyle,
        });
        try {
          if (normalizedImages.length === 0) {
            const brainRes = await scholarBrain.complete({
              req,
              systemPrompt: effectiveSystemPrompt,
              userPrompt: assembledUserPrompt,
              taskClass: "drafting",
              responseFormat: "text",
            });
            result = { text: brainRes.text, provider: brainRes.provider, model: brainRes.model };
          } else {
            const text = await routedCompletion(req, {
              task: "vision",
              systemPrompt: effectiveSystemPrompt,
              userPrompt: assembledUserPrompt,
              images: normalizedImages.map((img: { mimeType: string; data: string }) => ({ mediaType: img.mimeType, data: img.data })),
            });
            result = { text, provider: answeredByLabel(req), model: answeredByLabel(req) };
          }
        } catch (execErr: unknown) {
          // No AI, or the user's local model: the browser runs the prompt (426).
          // A provider failure is reported (502), never silently handed off.
          if (execErr instanceof NoClientAiProviderError || execErr instanceof LocalModelUnreachableError) return chatHandOff();
          return sendAiFailure(res, execErr, "The answer");
        }
      }

      if (!result.text || !result.text.trim()) {
        return sendAiFailure(res, new Error("The AI returned an empty answer."), "The answer");
      }

      // 7. Post-Generation Anti-Hallucination Lock & Quality-Control via scholarBrain (only for strict Vault/Canonical ledger mode)
      if (useStrictVaultLedger && (isSubstantive || canonicalSources.length > 0 || unifiedEvidence.length > 0)) {
        const verifiedItems: VerifiedSourceItem[] = [
          ...unifiedEvidence
            .filter((e) => e.authors && e.authors.length > 0 && e.year)
            .map((e) => ({
              id: e.id,
              authors: e.authors,
              year: String(e.year),
              title: e.title,
              doi: e.doi,
              url: e.url,
              journal: e.venue,
            })),
          ...canonicalSources
            .filter((s) => s.authors && s.authors.length > 0 && s.year)
            .map((s) => ({
              id: s.id,
              authors: s.authors,
              year: String(s.year),
              title: s.title,
              doi: s.doi,
              url: s.url,
              journal: s.venue,
            })),
        ];

        const uniqueVerified = Array.from(new Map(verifiedItems.map((item) => [item.id, item])).values());

        const normalizedStyleKey: CitationStyleKey =
          cleanStyle === "apa" || cleanStyle === "apa7" ? "apa7" :
          cleanStyle === "ieee" ? "ieee" :
          cleanStyle === "harvard" ? "harvard" :
          cleanStyle === "chicago" ? "chicago" :
          cleanStyle === "mla" || cleanStyle === "mla9" ? "mla9" :
          cleanStyle === "vancouver" ? "vancouver" : "apa7";

        const scrubbed = scholarBrain.scrubAndFormatCitations(
          result.text,
          uniqueVerified,
          normalizedStyleKey,
          "en-GB"
        );

        let finalText = scrubbed.formattedText;
        if (
          scrubbed.citedSources.length > 0 &&
          scrubbed.bibliographyMarkdown &&
          !finalText.toLowerCase().includes("## references") &&
          !finalText.toLowerCase().includes("## bibliography")
        ) {
          finalText += `\n\n## References\n\n${scrubbed.bibliographyMarkdown}`;
        }

        const exactWords = countExactWords(finalText);
        const burstiness = evaluateBurstiness(finalText);

        if (deliverableIntent && scrubbed.citedSources.length > 0) {
          deliverableIntent.retrievedSources = scrubbed.citedSources.map((s) => ({
            title: s.title,
            authors: Array.isArray(s.authors) ? s.authors : [s.authors],
            year: s.year,
            doi: s.doi,
            url: s.url,
            venue: s.journal,
          }));
        }

        return res.json({
          ok: true,
          text: finalText,
          provider: result.provider,
          model: result.model,
          mode: deliverableIntent ? "deliverable" : mode,
          citations: scrubbed.citedSources.map((s) => ({
            title: s.title,
            url: s.url,
            doi: s.doi,
            snippet: s.title,
            venue: s.journal,
            year: s.year,
            authors: Array.isArray(s.authors) ? s.authors : [s.authors],
            authorityBadge: "Verified Source",
            isPrimary: true,
            sourceType: "scholarly",
          })),
          citationStyle: cleanStyle,
          wordCount: exactWords,
          verifiedSourcesCount: scrubbed.citedSources.length,
          burstinessMetrics: burstiness,
          recommendedWorkspaceHandoff: deliverableIntent,
        });
      }

      const validated = validateAndRefineCitations(result.text, citations, {
        files,
        images: normalizedImages,
        requireSourcesSection: mode === "search",
        citationStyle: cleanStyle,
      });

      const fallbackWordCount = validated.text.trim().split(/\s+/).filter(Boolean).length;

      res.json({
        ok: true,
        text: validated.text,
        provider: result.provider,
        model: result.model,
        mode,
        citations: validated.citations,
        citationStyle: cleanStyle,
        wordCount: fallbackWordCount,
        verifiedSourcesCount: (validated.citations || []).length,
        peerReviewAudit: validated.peerReviewAudit,
        recommendedWorkspaceHandoff: deliverableIntent,
      });
    } catch (err) {
      if (err instanceof InvalidLlmChallengeError) {
        return res.status(403).json({ ok: false, error: err.message, code: "ai_challenge_invalid" });
      }
      console.error("Agent execution error:", err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        ok: false,
        error: message || "Failed to generate AI response.",
        code: "GENERATION_FAILED",
      });
    }
  });


  // Cross-session AskScholar threads (Supabase `ask_threads`; see server/src/askThreads/threadStore.ts)
  const threadUser = (req: Request, res: Response): string | null => {
    const id = (req as Request & { user?: { id?: string } }).user?.id;
    if (!id) {
      res.status(401).json({ ok: false, error: "Sign in to sync conversations." });
      return null;
    }
    return String(id);
  };

  router.get("/threads", requireAuth, async (req: Request, res: Response) => {
    const userId = threadUser(req, res);
    if (!userId) return;
    try {
      res.json({ ok: true, threads: await listThreads(userId) });
    } catch (err) {
      console.error("Thread list failed:", err);
      res.status(502).json({ ok: false, error: "Could not load conversations." });
    }
  });

  router.post("/threads", requireAuth, async (req: Request, res: Response) => {
    const userId = threadUser(req, res);
    if (!userId) return;
    const { threads, rejected } = parseThreads(req.body?.threads);
    if (threads.length === 0 && rejected > 0) {
      return res.status(400).json({ ok: false, error: "No valid conversation in the request." });
    }
    try {
      res.json({ ok: true, rejected, threads: await saveThreads(userId, threads) });
    } catch (err) {
      console.error("Thread save failed:", err);
      res.status(502).json({ ok: false, error: "Could not save conversations." });
    }
  });

  router.delete("/threads/:threadId", requireAuth, async (req: Request, res: Response) => {
    const userId = threadUser(req, res);
    if (!userId) return;
    try {
      await deleteThread(userId, String(req.params.threadId).slice(0, 80));
      res.json({ ok: true });
    } catch (err) {
      console.error("Thread delete failed:", err);
      res.status(502).json({ ok: false, error: "Could not delete the conversation." });
    }
  });

  app.use("/api/ai", router);
}
