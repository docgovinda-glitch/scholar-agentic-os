import express, { Request, Response } from "express";
import { getCandidates, getPremiumAiPolicy, executeMultimodalAgentic } from "../utils/llm.ts";
import { executeWebSearch, formatSearchResultsForPrompt } from "../src/research/webSearchEngine.ts";
import { executeDeepResearch } from "../src/research/deepResearchEngine.ts";
import type { CitationStyleRegistry } from "../../src/citation_compliance/formattingEngine.ts";

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
    if (lower.includes("search the web") || lower.includes("search online") || lower.includes("lookup online")) {
      return "search";
    }
    if (lower.includes("deep research") || lower.includes("systematic literature review")) {
      return "deep-research";
    }
    return "chat";
  }

  // Deep research triggers
  const deepResearchTriggers = [
    "deep research",
    "comprehensive research",
    "conduct detailed research",
    "investigate thoroughly",
    "systematic literature review",
    "detailed analysis of all sources",
    "cross-check claims",
    "multi-source research",
  ];
  if (deepResearchTriggers.some((t) => lower.includes(t))) {
    return "deep-research";
  }

  // Web search triggers
  const searchTriggers = [
    "search the web",
    "latest developments",
    "current events",
    "recent news",
    "what happened in 202",
    "current status of",
    "who is currently",
    "today",
    "recent studies on",
    "lookup online",
    "web search",
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
  router.get("/status", async (_req: Request, res: Response) => {
    try {
      const candidates = getCandidates();
      const policy = getPremiumAiPolicy();
      const operational = candidates.length > 0 && policy.status === "active";

      const providers = candidates.map((c) => ({
        id: c.provider,
        name:
          c.provider === "gemini"
            ? "Google Gemini"
            : c.provider === "openrouter"
            ? "OpenRouter"
            : c.provider === "anthropic"
            ? "Anthropic Claude"
            : c.provider,
        model: c.model || (c.provider === "gemini" ? "gemini-3.1-flash-lite" : "default"),
        tier: "server",
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
        providers,
        activeRoute: candidates[0]?.provider || null,
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

      const candidates = getCandidates();
      if (candidates.length === 0) {
        return res.status(503).json({ error: "No operational AI providers configured for deep research." });
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
        systemPrompt = "You are Scholar Core Socratic Assistant, an authoritative academic companion. Provide precise, rigorous, intellectually honest answers with clear citations.",
        history = [],
        files = [],
        images = [],
        mode: requestedMode,
      } = req.body || {};

      if (!prompt && (!files || files.length === 0) && (!images || images.length === 0)) {
        return res.status(400).json({ error: "Empty prompt or query supplied." });
      }

      const candidates = getCandidates();
      if (candidates.length === 0) {
        return res.status(503).json({
          ok: false,
          error: "No AI provider is currently operational. Please configure GEMINI_API_KEY or OPENROUTER_API_KEY on the server or connect a provider in AI Access.",
          code: "PROVIDER_UNAVAILABLE",
        });
      }

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

      const mode = determineExecutionMode(effectivePrompt, requestedMode, files.length > 0, normalizedImages.length > 0);

      // ── Workflow: Deep Research Mode ──
      if (mode === "deep-research") {
        const research = await executeDeepResearch(effectivePrompt, candidates, undefined, files, normalizedImages);
        return res.json({
          ok: true,
          mode: "deep-research",
          text: research.synthesizedReport,
          plan: research.plan,
          citations: research.allCitations,
          provider: "gemini",
          model: "gemini-3.1-flash-lite",
        });
      }

      // ── Context Assembly: Files, Images & Web Search ──
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

      let citations: any[] = [];

      // 2. Process Web Search if required
      if (mode === "search") {
        const searchResponse = await executeWebSearch(effectivePrompt, { maxResults: 5, fetchFullContent: true });
        citations = searchResponse.results;
        contextBlocks.push(`=== LIVE WEB SEARCH RESULTS & SOURCES ===\n${formatSearchResultsForPrompt(searchResponse.results)}\n=== END OF LIVE SEARCH RESULTS ===`);
      }

      // 3. Assemble Conversation History
      let conversationHistoryText = "";
      if (history && history.length > 0) {
        conversationHistoryText = "Prior Conversation Context:\n";
        for (const msg of history.slice(-6)) {
          conversationHistoryText += `${msg.role === "user" ? "User" : "Scholar Core"}: ${msg.content}\n`;
        }
        conversationHistoryText += "\n";
      }

      // 4. Build Final User Instruction Prompt
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
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nNote: You have access to both the user's uploaded document(s) and live web search findings. Clearly distinguish facts derived from the uploaded file from facts obtained via web sources, and cite web sources where appropriate.`;
      } else if (files.length > 0) {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nAnalyze the uploaded document above and directly answer the user's inquiry based on the document text.`;
      } else if (mode === "search") {
        assembledUserPrompt += `User Inquiry: ${effectivePrompt}\n\nSynthesize an authoritative, evidence-backed answer using the live web search findings provided above. Cite your sources with markdown links [Source Title](URL).`;
      } else {
        assembledUserPrompt += effectivePrompt;
      }

      // 5. Execute Agent with Multimodal & Model Failover Support
      const result = await executeMultimodalAgentic({
        systemPrompt,
        userPrompt: assembledUserPrompt,
        images: normalizedImages && normalizedImages.length > 0 ? normalizedImages : undefined,
        taskType: normalizedImages && normalizedImages.length > 0 ? "chat" : "reasoning",
        candidates,
      });

      res.json({
        ok: true,
        text: result.text,
        provider: result.provider,
        model: result.model,
        mode,
        citations,
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
