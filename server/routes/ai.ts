import express, { Request, Response } from "express";
import { requireAuth } from "../src/middleware/auth.ts";
import { getCandidates, getPremiumAiPolicy, executeMultimodalAgentic, readVerifiedBrowserResult, resolveRequestAiConfig, signLlmChallenge, computePromptHash } from "../utils/llm.ts";
import { InvalidLlmChallengeError } from "../src/ai/aiRouteErrors.ts";
import { executeWebSearch, formatSearchResultsForPrompt } from "../src/research/webSearchEngine.ts";
import { executeDeepResearch } from "../src/research/deepResearchEngine.ts";
import { validateAndRefineCitations } from "../src/research/citationValidator.ts";
import type { CitationStyleRegistry } from "../../src/citation_compliance/formattingEngine.ts";
import type { CanonicalReference } from "../../src/citation_compliance/model/reference.ts";
import {
  detectDeliverableIntent,
  isSubstantiveAcademicQuery,
  retrieveCanonicalSourcesForPrompt,
  buildGroundedAskScholarSystemPrompt,
  sanitizeAndLockScholarResponse,
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

/**
 * Ask Scholar's live web search, cached per query for 20 minutes so a request
 * retried after the browser-AI hand-off (426) rebuilds the identical prompt and
 * its challenge matches. A failed search is not cached.
 */
const ASK_SEARCH_TTL_MS = 20 * 60 * 1000;
const askSearchCache = new Map<string, { at: number; value: Promise<Awaited<ReturnType<typeof executeWebSearch>>> }>();
function cachedAskScholarWebSearch(query: string): Promise<Awaited<ReturnType<typeof executeWebSearch>>> {
  const key = query.trim().toLowerCase();
  const hit = askSearchCache.get(key);
  if (hit && Date.now() - hit.at < ASK_SEARCH_TTL_MS) return hit.value;
  const value = executeWebSearch(query, { maxResults: 6, fetchFullContent: true });
  value.catch(() => askSearchCache.delete(key));
  askSearchCache.set(key, { at: Date.now(), value });
  if (askSearchCache.size > 200) {
    const oldest = askSearchCache.keys().next().value;
    if (oldest !== undefined) askSearchCache.delete(oldest);
  }
  return value;
}

/**
 * Intelligent Capability Determination:
 * Analyzes prompt content, attachments, and explicit mode to choose the optimal workflow.
 */
function determineExecutionMode(
  prompt: string,
  explicitMode?: string,
  hasFiles?: boolean,
  hasImages?: boolean
): "chat" | "search" | "deep-research" {
  if (explicitMode === "deep-research") return "deep-research";
  if (explicitMode === "search") return "search";
  if (explicitMode === "chat") return "chat";

  const lower = prompt.toLowerCase();

  // If user uploaded files or images, do NOT accidentally hijack into generic web search
  // unless user explicitly requested external web search or online literature review
  if (hasFiles || hasImages) {
    if (
      lower.includes("search the web") ||
      lower.includes("search online") ||
      lower.includes("lookup online") ||
      lower.includes("external sources") ||
      lower.includes("verify online") ||
      lower.includes("fact check")
    ) {
      return "search";
    }
    if (lower.includes("deep research") || lower.includes("systematic literature review")) {
      return "deep-research";
    }
    return "chat";
  }

  // Deep research triggers: complex, comparative, multi-step scholarly inquiries
  const deepResearchTriggers = [
    "deep research",
    "comprehensive research",
    "conduct detailed research",
    "investigate thoroughly",
    "systematic literature review",
    "detailed analysis of all sources",
    "cross-check claims",
    "multi-source research",
    "comparative study",
    "meta-analysis",
    "conflicting evidence",
  ];
  if (deepResearchTriggers.some((t) => lower.includes(t))) {
    return "deep-research";
  }

  // Web search triggers: academic literature, current events, temporal queries, facts, people, orgs, policies, statistics
  const currentYear = new Date().getFullYear();
  const searchTriggers = [
    "search the web",
    "latest developments",
    "current events",
    "recent news",
    "current status",
    "who is currently",
    "today",
    "yesterday",
    "this week",
    "this month",
    "this year",
    "now",
    "recent studies",
    "lookup online",
    "web search",
    "prime minister",
    "president",
    "stock price",
    "market cap",
    "inflation rate",
    "gdp",
    "election",
    "guidelines",
    "regulations",
    "what happened to",
    "who won",
    "current price",
    "study",
    "studies",
    "paper",
    "papers",
    "research",
    "literature",
    "clinical",
    "trial",
    "findings",
    "evidence",
    "citation",
    "citations",
    "reference",
    "references",
    "bibliography",
    String(currentYear),
    String(currentYear - 1),
  ];
  if (searchTriggers.some((t) => lower.includes(t))) {
    return "search";
  }

  return "chat";
}

export function registerAIRoutes(
  app: express.Express,
  _aiAbuseLimit?: any,
  _citationStyleRegistry?: CitationStyleRegistry
): void {
  const router = express.Router();

  /**
   * GET /api/ai/status
   * Unified, single source of truth for AI operational status.
   */
  router.get("/status", async (req: Request, res: Response) => {
    try {
      const aiConfig = resolveRequestAiConfig(req);
      const candidates = aiConfig.candidates;
      const policy = getPremiumAiPolicy(req);
      const operational = candidates.length > 0 && policy.status === "active";

      const providers = candidates.map((c) => ({
        id: c.provider,
        name:
          c.provider === "gemini"
            ? "Google Gemini"
            : c.provider === "openrouter"
            ? "OpenRouter"
            : c.provider === "anthropic" || c.provider === "claude"
            ? "Anthropic Claude"
            : c.provider,
        model: c.model || aiConfig.model || "dynamic",
        tier: "byok",
        capabilities:
          c.provider === "gemini"
            ? ["text", "vision", "reasoning", "multimodal"]
            : ["text", "reasoning"],
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
        activeRoute: candidates[0]?.provider || null,
        activeModel: aiConfig.model || null,
        capabilities: {
          text: operational,
          vision: operational && candidates.some((c) => c.provider === "gemini" || c.provider === "openrouter"),
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
   * Dedicated Deep Research pipeline with full document and image support.
   */
  router.post("/deep-research", requireAuth, async (req: Request, res: Response) => {
    try {
      const { topic, files = [], images = [] } = req.body || {};
      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ error: "Missing required topic string" });
      }

      const candidates = getCandidates(req);
      if (candidates.length === 0) {
        return res.status(503).json({ error: "No client-owned AI provider configured for deep research. Please configure in AI Access." });
      }

      const [evidence, webResults] = await Promise.all([
        scholarBrain.retrieveEvidence({ query: topic, maxResults: 15 }).catch(() => []),
        executeWebSearch(topic, { maxResults: 8, fetchFullContent: true }).catch(() => ({ results: [] })),
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

      const result = await executeDeepResearch(topic, candidates, undefined, files, normalizedImages);

      const verifiedSources: VerifiedSourceItem[] = evidence.map((e) => ({
        id: e.id,
        authors: e.authors,
        year: e.year || "n.d.",
        title: e.title,
        doi: e.doi,
        url: e.url,
        journal: e.venue,
      }));

      const scrubbed = scholarBrain.scrubAndFormatCitations(
        result.synthesizedReport,
        verifiedSources,
        "apa7",
        "en-GB"
      );

      res.json({
        ok: true,
        ...result,
        synthesizedReport: scrubbed.formattedText,
        text: scrubbed.formattedText,
        wordCount: countExactWords(scrubbed.formattedText),
        verifiedSourcesCount: scrubbed.citedSources.length,
        evidence,
      });
    } catch (err) {
      res.status(500).json({ error: `Deep research failed: ${err instanceof Error ? err.message : String(err)}` });
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
        systemPrompt = "You are Scholar Core Socratic Assistant, an authoritative academic companion. Provide precise, rigorous, intellectually honest answers with clear citations. Where appropriate, use structured data formats like Markdown tables to compare or organize information. Prioritize the most recent and highly relevant empirical data, incorporating analytical depth.",
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
      const aiConfig = resolveRequestAiConfig(req);
      const candidates = getCandidates(req);

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
      const mode = determineExecutionMode(effectivePrompt, requestedMode, files.length > 0, normalizedImages.length > 0);
      const cleanStyle = (citationStyle || "apa").toLowerCase();

      // ── Canonical Scholarly Ingestion (OpenAlex, Crossref, Vault) via scholarBrain ──
      let canonicalSources: GroundedScholarSource[] = [];
      let unifiedEvidence: UnifiedEvidenceItem[] = [];
      if (req.body?.canonicalSources && Array.isArray(req.body.canonicalSources) && req.body.canonicalSources.length > 0) {
        canonicalSources = req.body.canonicalSources;
      } else if (isSubstantive || mode === "search") {
        try {
          const vaultSources = Array.isArray(req.body?.vaultSources) ? req.body.vaultSources : [];
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
      if (mode === "deep-research" && hasBrowserResult) {
        const deepSysPrompt = "You are Scholar Core Deep Research Agent. Provide an exhaustive, deeply researched academic synthesis with verified citations and structured sections.";
        incomingLlmResult = readVerifiedBrowserResult(req, deepSysPrompt, effectivePrompt);
      } else if (mode === "deep-research") {
        const deepSysPrompt = "You are Scholar Core Deep Research Agent. Provide an exhaustive, deeply researched academic synthesis with verified citations and structured sections.";
        if (candidates.length === 0) {
          return res.status(426).json({
            requireFrontendLLM: true,
            challengeToken: makeChallengeToken(deepSysPrompt, effectivePrompt),
            systemPrompt: deepSysPrompt,
            userPrompt: effectivePrompt,
            taskType: "reasoning",
            mode: "deep-research",
            canonicalSources,
            deliverableIntent,
            citationStyle: cleanStyle,
          });
        }
        try {
          const research = await executeDeepResearch(effectivePrompt, candidates, undefined, files, normalizedImages);
          const locked = sanitizeAndLockScholarResponse(research.synthesizedReport, [], citationStyle, deliverableIntent);
          return res.json({
            ok: true,
            mode: "deep-research",
            text: locked.text,
            plan: research.plan,
            citations: research.allCitations,
            provider: candidates[0]?.provider || "byok",
            model: candidates[0]?.model || aiConfig.model || "client-selected",
            citationStyle,
            wordCount: locked.wordCount,
            verifiedSourcesCount: (research.allCitations || []).length,
            burstinessMetrics: locked.burstinessMetrics,
            recommendedWorkspaceHandoff: locked.recommendedWorkspaceHandoff,
          });
        } catch (deepErr: unknown) {
          console.warn("Server deep research execution failed, falling back to frontend LLM:", deepErr);
          return res.status(426).json({
            requireFrontendLLM: true,
            challengeToken: makeChallengeToken(deepSysPrompt, effectivePrompt),
            systemPrompt: deepSysPrompt,
            userPrompt: effectivePrompt,
            taskType: "reasoning",
            mode: "deep-research",
            canonicalSources,
            deliverableIntent,
            citationStyle: cleanStyle,
          });
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

      // 2. Canonical Citation Ledger Context Block
      if (canonicalSources.length > 0) {
        contextBlocks.push(
          `=== RETRIEVED CANONICAL SCHOLARLY SOURCES (EXCLUSIVE CITATION LEDGER) ===\n` +
          canonicalSources
            .map(
              (s, idx) =>
                `[Source ${idx + 1}] (${s.id}) In-Text Citation: ${s.inTextCitation}\nTitle: "${s.title}"\nAuthors: ${s.authors.join(", ") || "Unknown Author"}\nYear: ${s.year || "n.d."}\nDOI: ${s.doi || "None"}\nVenue/Publisher: ${s.venue || "not recorded"}\nURL: ${s.url || "N/A"}`
            )
            .join("\n\n") +
          `\n=== END OF EXCLUSIVE CITATION LEDGER ===`
        );
      }

      let citations: any[] = [];

      // 3. Process Web Search if required
      if (mode === "search" && canonicalSources.length < 3) {
        const searchResponse = await cachedAskScholarWebSearch(effectivePrompt);
        citations = searchResponse.results;
        contextBlocks.push(`=== LIVE SCHOLARLY & WEB SEARCH RESULTS ===\n${formatSearchResultsForPrompt(searchResponse.results)}\n=== END OF SEARCH RESULTS ===`);
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

      // 5. Build Final Grounded System Prompt
      let effectiveSystemPrompt = systemPrompt;
      if (isSubstantive || canonicalSources.length > 0) {
        effectiveSystemPrompt = buildGroundedAskScholarSystemPrompt(canonicalSources, deliverableIntent, cleanStyle);
      }

      const styleNameMap: Record<string, string> = {
        apa: "APA 7th Edition (Author-Date format, e.g., (Author, Year))",
        mla: "MLA 9th Edition (Author format, e.g., (Author))",
        chicago: "Chicago 17th Author-Date (e.g., (Author Year))",
        harvard: "Harvard Referencing (e.g., (Author, Year))",
        ieee: "IEEE Numbered Style (e.g., [1])",
        vancouver: "Vancouver Numbered Style (e.g., [1])",
      };
      const styleDescription = styleNameMap[cleanStyle] || styleNameMap.apa;

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
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nNote: You have access to both the user's uploaded document(s) and live verified web search findings. Clearly distinguish facts derived from the uploaded file from facts obtained via web sources. Ground external facts in the retrieved sources and cite with proper in-text citations (${styleDescription}).`;
      } else if (files.length > 0) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nAnalyze the uploaded document above and directly answer the user's inquiry based on the document text.`;
      } else if (isSubstantive || canonicalSources.length > 0) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nDeliver an authoritative, research-grounded synthesis. Strict requirements:\n1. Only cite sources from the Exclusive Citation Ledger above using verified [CITE:id] tokens.\n2. Do NOT fabricate authors, years, or citations not in the ledger.\n3. Any empirical statistic lacking a verified source must be tagged: [Unverified Claim — Vault Citation Required].\n4. Do NOT output fake word count declarations.`;
      } else if (mode === "search") {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nSynthesize an authoritative, research-grade answer using the live verified web search findings provided above.

Formatting & Academic Citation Rules:
1. Prioritize Credibility & Recency: Emphasize recently published peer-reviewed literature, official reports (.gov/.edu), and authoritative sources.
2. In-Text Citations: Ground every assertion in the retrieved sources above using proper in-text citations formatted in ${styleDescription}.
3. Cross-Verification: If credible sources present different methodologies, figures, or perspectives, analyze the divergence clearly.
4. Absolute Citation Accuracy: Only cite the retrieved sources above. Never invent citations, DOIs, or fabricated claims.
5. Conclude with a clean "## References & Evidence Base" section formatted according to ${styleDescription} listing the consulted sources.`;
      } else {
        assembledUserPrompt += effectivePrompt;
      }

      if (hasBrowserResult && incomingLlmResult === null) {
        incomingLlmResult = readVerifiedBrowserResult(req, effectiveSystemPrompt, assembledUserPrompt);
      }

      // 6. Execute Agent with Multimodal & Model Failover Support
      if (!incomingLlmResult && candidates.length === 0) {
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
        try {
          if (candidates.length > 0 && normalizedImages.length === 0) {
            const brainRes = await scholarBrain.complete({
              req,
              systemPrompt: effectiveSystemPrompt,
              userPrompt: assembledUserPrompt,
              taskClass: "drafting",
              responseFormat: "text",
            });
            result = {
              text: brainRes.text,
              provider: brainRes.provider,
              model: brainRes.model,
            };
          } else {
            result = await executeMultimodalAgentic({
              systemPrompt: effectiveSystemPrompt,
              userPrompt: assembledUserPrompt,
              images: normalizedImages && normalizedImages.length > 0 ? normalizedImages : undefined,
              taskType: normalizedImages && normalizedImages.length > 0 ? "chat" : "reasoning",
              candidates,
            }, req);
          }
        } catch (execErr: unknown) {
          console.warn("Server multimodal agent execution failed, requesting frontend LLM fallback:", execErr);
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
      }

      // 7. Post-Generation Anti-Hallucination Lock & Quality-Control via scholarBrain
      if (isSubstantive || canonicalSources.length > 0 || unifiedEvidence.length > 0) {
        const verifiedItems: VerifiedSourceItem[] = [
          ...unifiedEvidence.map((e) => ({
            id: e.id,
            authors: e.authors,
            year: e.year || "n.d.",
            title: e.title,
            doi: e.doi,
            url: e.url,
            journal: e.venue,
          })),
          ...canonicalSources.map((s) => ({
            id: s.id,
            authors: s.authors,
            year: s.year || "n.d.",
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


  app.use("/api/ai", router);
}
