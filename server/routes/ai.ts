import express, { Request, Response } from "express";
import { getCandidates, getPremiumAiPolicy, executeMultimodalAgentic, handleFrontendLLMOverride, resolveRequestAiConfig } from "../utils/llm.ts";
import { executeWebSearch, formatSearchResultsForPrompt } from "../src/research/webSearchEngine.ts";
import { executeDeepResearch } from "../src/research/deepResearchEngine.ts";
import { validateAndRefineCitations } from "../src/research/citationValidator.ts";
import type { CitationStyleRegistry } from "../../src/citation_compliance/formattingEngine.ts";
import {
  detectDeliverableIntent,
  isSubstantiveAcademicQuery,
  retrieveCanonicalSourcesForPrompt,
  buildGroundedAskScholarSystemPrompt,
  sanitizeAndLockScholarResponse,
  type GroundedScholarSource,
} from "../src/research/scholarlyRetrievalPipeline.ts";

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
  router.post("/search", async (req: Request, res: Response) => {
    try {
      const { query, maxResults = 5 } = req.body || {};
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing required query string" });
      }

      const results = await executeWebSearch(query, { maxResults: Number(maxResults) || 5, fetchFullContent: true });
      res.json({ ok: true, ...results });
    } catch (err) {
      res.status(500).json({ error: `Web search failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  /**
   * POST /api/ai/deep-research
   * Dedicated Deep Research pipeline with full document and image support.
   */
  router.post("/deep-research", async (req: Request, res: Response) => {
    try {
      const { topic, files = [], images = [] } = req.body || {};
      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ error: "Missing required topic string" });
      }

      const candidates = getCandidates(req);
      if (candidates.length === 0) {
        return res.status(503).json({ error: "No client-owned AI provider configured for deep research. Please configure in AI Access." });
      }

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
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: `Deep research failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  /**
   * POST /api/ai/agent
   * Primary unified research agent endpoint:
   * Handles text, files, images, web search, deep research, conversation context, and failover.
   */
    router.post("/agent", async (req: Request, res: Response) => {
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

      const incomingLlmResult = handleFrontendLLMOverride(req);
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

      // ── Canonical Scholarly Ingestion (OpenAlex, Crossref, Vault) ──
      let canonicalSources: GroundedScholarSource[] = [];
      if (req.body?.canonicalSources && Array.isArray(req.body.canonicalSources) && req.body.canonicalSources.length > 0) {
        canonicalSources = req.body.canonicalSources;
      } else if (isSubstantive || mode === "search") {
        try {
          canonicalSources = await retrieveCanonicalSourcesForPrompt(effectivePrompt, {
            maxResults: 8,
            citationStyle: cleanStyle,
          });
        } catch (err) {
          console.warn("Scholarly canonical retrieval warning:", err);
          canonicalSources = [];
        }
      }

      // ── Workflow: Deep Research Mode ──
      if (mode === "deep-research" && !incomingLlmResult) {
        if (candidates.length === 0) {
          return res.status(426).json({
            requireFrontendLLM: true,
            systemPrompt: "You are Scholar Core Deep Research Agent. Provide an exhaustive, deeply researched academic synthesis with verified citations and structured sections.",
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
            systemPrompt: "You are Scholar Core Deep Research Agent. Provide an exhaustive, deeply researched academic synthesis with verified citations and structured sections.",
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

      // 1. Process Uploaded Documents
      if (files && files.length > 0) {
        for (const file of files) {
          const docText = (file.text || "").trim();
          if (docText) {
            // Cap document preview to 20,000 chars per file to stay within limits while preserving depth
            const truncated = docText.length > 20000 ? docText.slice(0, 20000) + "\n\n... [Content continues in full document] ..." : docText;
            contextBlocks.push(`=== UPLOADED DOCUMENT: ${file.name || "Document"} ===\n${truncated}\n=== END OF DOCUMENT: ${file.name || "Document"} ===`);
          } else {
            contextBlocks.push(`=== UPLOADED DOCUMENT: ${file.name || "Document"} (Empty content or binary format) ===`);
          }
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
                `[Source ${idx + 1}] (${s.id}) In-Text Citation: ${s.inTextCitation}\nTitle: "${s.title}"\nAuthors: ${s.authors.join(", ") || "Unknown Author"}\nYear: ${s.year || "n.d."}\nDOI: ${s.doi || "None"}\nVenue/Publisher: ${s.venue || "Academic Publication"}\nURL: ${s.url || "N/A"}`
            )
            .join("\n\n") +
          `\n=== END OF EXCLUSIVE CITATION LEDGER ===`
        );
      }

      let citations: any[] = [];

      // 3. Process Web Search if required
      if (mode === "search" && canonicalSources.length < 3) {
        const searchResponse = await executeWebSearch(effectivePrompt, { maxResults: 6, fetchFullContent: true });
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
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nDeliver an authoritative, research-grounded synthesis. Strict requirements:\n1. Only cite sources from the Exclusive Citation Ledger above.\n2. Do NOT fabricate authors, years, or citations not in the ledger.\n3. Any empirical statistic lacking a verified source must be tagged: [Unverified Claim — Vault Citation Required].\n4. Do NOT output fake word count declarations.`;
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

      // 6. Execute Agent with Multimodal & Model Failover Support
      if (!incomingLlmResult && candidates.length === 0) {
        return res.status(426).json({
          requireFrontendLLM: true,
          systemPrompt: effectiveSystemPrompt,
          userPrompt: assembledUserPrompt,
          taskType: normalizedImages && normalizedImages.length > 0 ? "chat" : "reasoning",
          mode,
          canonicalSources,
          deliverableIntent,
          citationStyle: cleanStyle,
        });
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
          result = await executeMultimodalAgentic({
            systemPrompt: effectiveSystemPrompt,
            userPrompt: assembledUserPrompt,
            images: normalizedImages && normalizedImages.length > 0 ? normalizedImages : undefined,
            taskType: normalizedImages && normalizedImages.length > 0 ? "chat" : "reasoning",
            candidates,
          }, req);
        } catch (execErr: unknown) {
          console.warn("Server multimodal agent execution failed, requesting frontend LLM fallback:", execErr);
          return res.status(426).json({
            requireFrontendLLM: true,
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

      // 7. Post-Generation Anti-Hallucination Lock & Quality-Control
      if (isSubstantive || canonicalSources.length > 0) {
        const locked = sanitizeAndLockScholarResponse(
          result.text,
          canonicalSources,
          cleanStyle,
          deliverableIntent
        );

        return res.json({
          ok: true,
          text: locked.text,
          provider: result.provider,
          model: result.model,
          mode: deliverableIntent ? "deliverable" : mode,
          citations: locked.citations.map((s) => ({
            title: s.title,
            url: s.url,
            doi: s.doi,
            snippet: s.title,
            venue: s.venue,
            year: s.year,
            authors: s.authors,
            authorityBadge: s.sourceType === "scholarly" ? "Peer-Reviewed / Canonical" : "Knowledge Vault",
            isPrimary: true,
            sourceType: s.sourceType,
          })),
          citationStyle: cleanStyle,
          wordCount: locked.wordCount,
          verifiedSourcesCount: locked.verifiedSourcesCount,
          burstinessMetrics: locked.burstinessMetrics,
          recommendedWorkspaceHandoff: locked.recommendedWorkspaceHandoff,
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
