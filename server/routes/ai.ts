import express from "express";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../../src/citation_compliance/model/reference.ts";
import { CitationStyleRegistry, CitationFormatterFactory } from "../../src/citation_compliance/formattingEngine.ts";
import { getCloudProvider, chatUrl, buildAuthHeaders, type CloudProviderSpec } from "../../src/config/providerCatalog.ts";

// ==========================================
// GLOBAL STATE
// ==========================================

// Local request memory cache
const requestCache = new Map<string, { timestamp: number; response: any }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache expiration

let requestCount = 0;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function selectGeminiKey(clientKey?: string): string {
  if (clientKey && clientKey !== "defined_on_server" && clientKey !== "") {
    return clientKey;
  }
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY_2
  ].filter(Boolean) as string[];

  if (keys.length === 0) return "";

  const selected = keys[requestCount % keys.length];
  requestCount++;
  return selected;
}

function isSafeOutboundBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (host === "[::1]" || host === "::1") return false;

  // Literal IPv4 addresses in private / link-local / loopback ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

function resolveProviderChatUrl(spec: CloudProviderSpec, baseUrlOverride?: string): string | null {
  if (baseUrlOverride && isSafeOutboundBaseUrl(baseUrlOverride)) {
    return chatUrl(spec, baseUrlOverride);
  }
  // Providers whose catalog entry has no base URL (Cloudflare) are unusable
  // without a valid override — better an explicit error than a request to "".
  if (!spec.baseUrl) return null;
  return chatUrl(spec);
}

function openAICompatibleBody(
  spec: CloudProviderSpec,
  opts: {
    model?: string;
    systemInstruction?: string;
    prompt: string;
    temperature?: number;
    stream?: boolean;
  }
): string {
  return JSON.stringify({
    model: opts.model || spec.defaultModel,
    messages: [
      { role: "system", content: opts.systemInstruction || "You are a helpful assistant." },
      { role: "user", content: opts.prompt },
    ],
    temperature: opts.temperature ?? 0.5,
    ...(opts.stream ? { stream: true } : {}),
  });
}

function resolveApiKey(provider: string, apiKey: string, username?: string): string {
  let activeApiKey = apiKey;
  if ((!activeApiKey || activeApiKey === "defined_on_server" || activeApiKey === "") && username) {
    // Note: in production this would need access to decryptServerKey and users DB
    // For now, this is a placeholder
  }
  return activeApiKey;
}

// Helper to initialize Gemini API Client safely (Lazy Initialization pattern)
function getGeminiClient() {
  const apiKey = selectGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined pin the Secrets panel.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Automatic backoff and retry helper for Gemini API calls to safeguard against transient 503/429 errors
async function generateContentWithRetry(
  aiClient: any,
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 4,
  initialDelayMs = 1500
): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await aiClient.models.generateContent(params);
    } catch (error: any) {
      attempt++;
      const errorMessage = error.message || "";
      const errorStatus = error.status || error.code || 0;

      const isTransient =
        errorStatus === 503 ||
        errorStatus === 429 ||
        errorStatus === 504 ||
        errorMessage.includes("503") ||
        errorMessage.includes("429") ||
        errorMessage.includes("high demand") ||
        errorMessage.includes("UNAVAILABLE") ||
        errorMessage.includes("RESOURCE_EXHAUSTED") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("transient");

      if (isTransient && attempt < maxRetries) {
        // Exponential backoff with jitter (e.g. attempt 1: ~1.5s, 2: ~3s, 3: ~6s)
        const delay = initialDelayMs * Math.pow(2, attempt - 1) * (0.85 + Math.random() * 0.3);
        console.warn(`[Gemini API] Transient error encountered (status: ${errorStatus}, msg: ${errorMessage}). Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // If we ran out of retries or it's not a transient error, propagate it
      console.error(`[Gemini API] API call failed definitely on attempt ${attempt}. Error:`, error);
      throw error;
    }
  }
}

// Helper to clean JSON strings returned by local models which might be wrapped in markdown code blocks
function cleanJsonString(text: string): string {
  let cleaned = text.trim();
  // Strip Markdown code block syntax if present
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Unified function to handle content generation based on the selected AI provider
async function generateWithSettings(params: {
  systemInstruction: string;
  prompt: string;
  temperature: number;
  responseMimeType?: string;
  aiSettings?: any;
}): Promise<string> {
  const provider = params.aiSettings?.provider || "gemini";

  if (provider === "gemini") {
    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: params.prompt,
      config: {
        systemInstruction: params.systemInstruction,
        responseMimeType: params.responseMimeType,
        temperature: params.temperature,
      }
    });
    return response.text?.trim() || "";
  }

  if (provider === "ollama") {
    const endpoint = params.aiSettings?.ollamaEndpoint || "http://localhost:11434";
    const model = params.aiSettings?.ollamaModel || "llama3";

    let fullPrompt = params.prompt;
    if (params.responseMimeType === "application/json") {
      fullPrompt += "\n\nIMPORTANT: Return strictly valid JSON only. Do not wrap it in markdown code blocks like ```json or anything else. Just the raw JSON string.";
    }

    console.log(`[Ollama Generation] URL: ${endpoint}/api/chat, Model: ${model}`);
    const response = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: params.systemInstruction },
          { role: "user", content: fullPrompt }
        ],
        stream: false,
        options: {
          temperature: params.temperature
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(`Ollama connection failed (status ${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    let text = data.message?.content || "";
    if (params.responseMimeType === "application/json") {
      text = cleanJsonString(text);
    }
    return text.trim();
  }

  if (provider === "custom") {
    const endpoint = params.aiSettings?.customEndpoint || "http://localhost:1234/v1";
    const model = params.aiSettings?.customModel || "llama3";

    let fullPrompt = params.prompt;
    if (params.responseMimeType === "application/json") {
      fullPrompt += "\n\nIMPORTANT: Return strictly valid JSON only. Do not wrap it in markdown code blocks like ```json or anything else. Just the raw JSON string.";
    }

    const cleanEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    const url = `${cleanEndpoint}/chat/completions`;
    console.log(`[Custom local AI Generation] URL: ${url}, Model: ${model}`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: params.systemInstruction },
          { role: "user", content: fullPrompt }
        ],
        temperature: params.temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(`Custom local server connection failed (status ${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    if (params.responseMimeType === "application/json") {
      text = cleanJsonString(text);
    }
    return text.trim();
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

function getCacheKey(body: any): string {
  const str = JSON.stringify({
    provider: body.provider,
    model: body.model,
    systemInstruction: body.systemInstruction,
    prompt: body.prompt,
    temperature: body.temperature,
    responseMimeType: body.responseMimeType
  });
  return crypto.createHash("sha256").update(str).digest("hex");
}

const sendCachedJson = (res: any, cacheKey: string, payload: any) => {
  requestCache.set(cacheKey, { timestamp: Date.now(), response: payload });
  return res.json(payload);
};

function resolveCitationStyleId(desiredStyle: string | undefined): string {
  const normalized = (desiredStyle || "").toLowerCase();
  if (normalized.includes("apa")) return "apa-7";
  if (normalized.includes("ieee")) return "ieee";
  if (normalized.includes("mla")) return "mla-9";
  if (normalized.includes("chicago")) return "chicago-author-date";
  if (normalized.includes("harvard")) return "harvard";
  if (normalized.includes("vancouver")) return "vancouver";
  return "apa-7";
}

function toPlainCitationText(citation: string): string {
  return citation
    .replace(/\*/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractedMetadataToReference(meta: any, sourceType: string | undefined): CanonicalReference {
  const kindMap: Record<string, ReferenceKind> = {
    "journal article": "JournalArticle",
    "book": "Book",
    "website": "Website",
    "report": "TechnicalReport",
    "thesis/dissertation": "Dissertation",
  };
  const kind = kindMap[(sourceType || "").toLowerCase()] ?? "JournalArticle";

  // Split on "&"/"and" first (these separate distinct authors), then parse
  // each segment as either "Last, First" or "First Last" - a bare comma
  // split would incorrectly treat "Smith, J. A." as two separate authors.
  const authorSegments = String(meta?.author || "")
    .split(/\s*(?:&|,?\s+and)\s*/i)
    .map((s: string) => s.trim())
    .filter(Boolean);
  const authors: ReferenceAuthor[] = authorSegments.map((segment: string, order: number) => {
    if (segment.includes(",")) {
      const [last, firstAndMiddle] = segment.split(",").map((p) => p.trim());
      const [firstName, ...middleParts] = (firstAndMiddle || "").split(/\s+/).filter(Boolean);
      return { firstName: firstName || "", middleName: middleParts.join(" ") || undefined, lastName: last || segment, order };
    }
    const parts = segment.split(/\s+/);
    const lastName = parts.pop() || segment;
    return { firstName: parts.join(" "), lastName, order };
  });

  return {
    kind,
    title: meta?.title || "Untitled",
    authors,
    source: meta?.publisherOrJournal || "",
    journal: kind === "JournalArticle" ? meta?.publisherOrJournal : undefined,
    publisher: kind !== "JournalArticle" ? meta?.publisherOrJournal : undefined,
    doi: meta?.doiOrUrl,
    url: meta?.doiOrUrl,
    year: meta?.year,
    publicationDate: meta?.year,
  };
}

// ==========================================
// ROUTE HANDLERS
// ==========================================

export function registerAIRoutes(app: express.Express, aiAbuseLimit: any, citationStyleRegistry: CitationStyleRegistry): void {
  // SSE Streaming Generation Proxy
  app.post("/api/stream-generate", aiAbuseLimit, async (req, res) => {
  try {
    const { provider, apiKey, model, systemInstruction, prompt, temperature, responseMimeType, username } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing required parameter: prompt" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const aiProvider = provider || "gemini";
    const activeApiKey = resolveApiKey(aiProvider, apiKey, username);

    if (aiProvider === "gemini" || aiProvider === "server") {
      const finalApiKey = selectGeminiKey(activeApiKey);
      if (!finalApiKey) {
        res.write(`data: ${JSON.stringify({ error: "Gemini API Key is not set." })}\n\n`);
        return res.end();
      }

      const aiClient = new GoogleGenAI({
        apiKey: finalApiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });

      const requestedModel = model || "gemini-2.5-flash";
      const modelQueue = [requestedModel];
      
      const standardFallbacks = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
      standardFallbacks.forEach(m => {
        if (m !== requestedModel) modelQueue.push(m);
      });

      let responseStream = null;
      let lastError = null;

      for (const targetModel of modelQueue) {
        let attempt = 0;
        const maxRetries = 3;
        let success = false;

        while (attempt < maxRetries) {
          try {
            console.log(`[Streaming API] Trying model "${targetModel}" (attempt ${attempt + 1}/${maxRetries})...`);
            responseStream = await aiClient.models.generateContentStream({
              model: targetModel,
              contents: prompt,
              config: {
                systemInstruction,
                responseMimeType,
                temperature
              }
            });
            success = true;
            break;
          } catch (error: any) {
            attempt++;
            lastError = error;
            const errMsg = error.message || "";
            const errStatus = error.status || error.code || 0;
            
            const isTransient = 
              errStatus === 503 || 
              errStatus === 429 || 
              errStatus === 504 || 
              errMsg.includes("503") || 
              errMsg.includes("429") || 
              errMsg.includes("UNAVAILABLE") || 
              errMsg.includes("RESOURCE_EXHAUSTED") || 
              errMsg.includes("rate limit") || 
              errMsg.includes("quota");

            if (isTransient && attempt < maxRetries && !errMsg.includes("daily") && !errMsg.includes("RequestsPerDay")) {
              const delay = 1500 * Math.pow(2, attempt - 1);
              console.warn(`[Streaming API] Transient error on "${targetModel}". Retrying in ${delay}ms...`);
              await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
              console.warn(`[Streaming API] Model "${targetModel}" failed definitely. Error: ${errMsg}. Trying fallback...`);
              break;
            }
          }
        }

        if (success && responseStream) {
          console.log(`[Streaming API] Successfully initialized stream with model "${targetModel}"`);
          break;
        }
      }

      if (!responseStream) {
        const errorMsg = lastError?.message || "Failed to initialize Gemini stream.";
        console.error("[Streaming API] All models failed. Last error:", errorMsg);
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        return res.end();
      }

      for await (const chunk of responseStream) {
        const text = chunk.text || "";
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      return res.end();
    }

    if (["openai", "deepseek", "qwen"].includes(aiProvider)) {
      if (!activeApiKey) {
        res.write(`data: ${JSON.stringify({ error: `${aiProvider.toUpperCase()} API Key is required.` })}\n\n`);
        return res.end();
      }

      let url = "https://api.openai.com/v1/chat/completions";
      let targetModel = model || "gpt-4o-mini";

      if (aiProvider === "deepseek") {
        url = "https://api.deepseek.com/chat/completions";
        targetModel = model || "deepseek-chat";
      } else if (aiProvider === "qwen") {
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
        targetModel = model || "qwen-plus";
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: "system", content: systemInstruction || "You are a helpful assistant." },
            { role: "user", content: prompt }
          ],
          temperature: temperature ?? 0.5,
          stream: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        res.write(`data: ${JSON.stringify({ error: `API stream failed: ${errText}` })}\n\n`);
        return res.end();
      }

      let buffer = "";
      for await (const chunk of response.body as any) {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned || cleaned === "data: [DONE]") continue;
          if (cleaned.startsWith("data: ")) {
            try {
              const json = JSON.parse(cleaned.slice(6));
              const text = json.choices?.[0]?.delta?.content || "";
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
      return res.end();
    }

    if (aiProvider === "claude") {
      if (!activeApiKey) {
        res.write(`data: ${JSON.stringify({ error: "Claude API Key is required." })}\n\n`);
        return res.end();
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": activeApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-20241022",
          max_tokens: 4000,
          system: systemInstruction || "You are a helpful assistant.",
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.5,
          stream: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        res.write(`data: ${JSON.stringify({ error: `Claude stream failed: ${errText}` })}\n\n`);
        return res.end();
      }

      let buffer = "";
      for await (const chunk of response.body as any) {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;
          if (cleaned.startsWith("data: ")) {
            try {
              const json = JSON.parse(cleaned.slice(6));
              if (json.type === "content_block_delta") {
                const text = json.delta?.text || "";
                if (text) {
                  res.write(`data: ${JSON.stringify({ text })}\n\n`);
                }
              }
            } catch (e) {}
          }
        }
      }
      return res.end();
    }

    if (aiProvider === "cohere") {
      if (!apiKey) {
        res.write(`data: ${JSON.stringify({ error: "Cohere API Key is required." })}\n\n`);
        return res.end();
      }

      const response = await fetch("https://api.cohere.ai/v1/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model || "command-r-plus",
          preamble: systemInstruction || "You are a helpful assistant.",
          message: prompt,
          temperature: temperature ?? 0.5,
          stream: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        res.write(`data: ${JSON.stringify({ error: `Cohere stream failed: ${errText}` })}\n\n`);
        return res.end();
      }

      let buffer = "";
      for await (const chunk of response.body as any) {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;
          try {
            const json = JSON.parse(cleaned);
            if (json.event_type === "text-generation") {
              const text = json.text || "";
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            }
          } catch (e) {}
        }
      }
      return res.end();
    }

    res.write(`data: ${JSON.stringify({ error: `Streaming not supported for provider: ${aiProvider}` })}\n\n`);
    return res.end();
  } catch (err: any) {
    console.error("Streaming endpoint error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message || "Streaming execution failed" })}\n\n`);
    return res.end();
  }
});

// AI Generation Proxy (With Caching Layer)
app.post("/api/generate", aiAbuseLimit, async (req, res) => {
  try {
    const { provider, apiKey, model, systemInstruction, prompt, temperature, responseMimeType, username } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing required parameter: prompt" });
    }

    // Caching check
    const cacheKey = getCacheKey(req.body);
    const cached = requestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log("[Cache Hit] Serving response from memory cache");
      return res.json(cached.response);
    }

    const aiProvider = provider || "gemini";
    const activeApiKey = resolveApiKey(aiProvider, apiKey, username);

    // 1. Google Gemini or Server-side Gemini Proxy
    if (aiProvider === "gemini" || aiProvider === "server") {
      const finalApiKey = selectGeminiKey(activeApiKey);
      if (!finalApiKey) {
        return res.status(400).json({ error: "Gemini API Key is not set." });
      }
      
      const aiClient = new GoogleGenAI({
        apiKey: finalApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await generateContentWithRetry(aiClient, {
        model: model || "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType,
          temperature,
        }
      });
      return sendCachedJson(res, cacheKey, { text: response.text?.trim() || "" });
    }

    // 2. OpenAI ChatGPT
    if (aiProvider === "openai") {
      if (!activeApiKey) {
        return res.status(400).json({ error: "OpenAI API Key is required." });
      }

      let messages = [
        { role: "system", content: systemInstruction || "You are a helpful assistant." },
        { role: "user", content: prompt }
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages,
          temperature: temperature ?? 0.5
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `OpenAI API failed: ${errText}` });
      }

      const data: any = await response.json();
      return sendCachedJson(res, cacheKey, { text: data.choices?.[0]?.message?.content?.trim() || "" });
    }

    // 3. Claude (Anthropic)
    if (aiProvider === "claude") {
      if (!activeApiKey) {
        return res.status(400).json({ error: "Claude API Key is required." });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": activeApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-20241022",
          max_tokens: 4000,
          system: systemInstruction || "You are a helpful assistant.",
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.5
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Claude API failed: ${errText}` });
      }

      const data: any = await response.json();
      return sendCachedJson(res, cacheKey, { text: data.content?.[0]?.text?.trim() || "" });
    }

    // 4. DeepSeek
    if (aiProvider === "deepseek") {
      if (!activeApiKey) {
        return res.status(400).json({ error: "DeepSeek API Key is required." });
      }

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model || "deepseek-chat",
          messages: [
            { role: "system", content: systemInstruction || "You are a helpful assistant." },
            { role: "user", content: prompt }
          ],
          temperature: temperature ?? 0.5
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `DeepSeek API failed: ${errText}` });
      }

      const data: any = await response.json();
      return sendCachedJson(res, cacheKey, { text: data.choices?.[0]?.message?.content?.trim() || "" });
    }

    // 5. Cohere
    if (aiProvider === "cohere") {
      if (!activeApiKey) {
        return res.status(400).json({ error: "Cohere API Key is required." });
      }

      const response = await fetch("https://api.cohere.ai/v1/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model || "command-r-plus",
          preamble: systemInstruction || "You are a helpful assistant.",
          message: prompt,
          temperature: temperature ?? 0.5
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Cohere API failed: ${errText}` });
      }

      const data: any = await response.json();
      return sendCachedJson(res, cacheKey, { text: data.text?.trim() || "" });
    }

    return res.status(400).json({ error: `Unsupported provider: ${aiProvider}` });
  } catch (error: any) {
    console.error("Server proxy generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate content" });
  }
});



// Phase B: Dissertation Grounding Agent
app.post("/api/generate/dissertation-grounding", aiAbuseLimit, async (req, res) => {
  try {
    const { 
      title, objectives, researchQuestions, researchGap, 
      methodology, field, keywords, journalScope, articleType, 
      dissertationMaterials, styleAspiration, aiSettings 
    } = req.body;

    const systemInstruction = `You are an elite, senior Academic Grounding and Epistemological Agent. 
Your objective is to ingest doctoral dissertation details, uploaded Knowledge Vault documents, and research intent, and map them into a solid publication blueprint. 
Maintain a rigorous, formal scholarly and philosophical tone, and identify direct lines of theoretical and conceptual continuity between the user's uploaded dissertation/manuscript and the proposed article.
You must always default to treating the user's uploaded research documents in the Knowledge Vault as the primary conceptual framework. Direct all theoretical and conceptual continuity to substantially citing and extending the uploaded research as the foundational backbone.`;

    const prompt = `Perform Phase B of the publication preparation. Take the following inputs:
- Proposed Title: ${title || "Untitled Paper"}
- Fields & Keywords: ${field || ""} | Keywords: ${keywords || ""}
- Objectives: ${objectives || ""}
- Research Questions: ${researchQuestions || ""}
- Research Gap: ${researchGap || ""}
- Methodology: ${methodology || ""}
- Article Type: ${articleType || "Academic"}
- Preferred Journal Scope: ${journalScope || ""}
- Dissertation Materials Provided: ${dissertationMaterials || "None provided"}
- Writing Style Guidelines: ${styleAspiration || "Standard Academic Style"}

Generate a comprehensive "Dissertation Grounding Map" in JSON format. Ensure all constructs, assumptions, arguments, and citations are systematically mapped back to treating the user's uploaded research documents or thesis as the foundational conceptual framework. Return strictly valid JSON containing the following properties:
{
  "conceptualFramework": "How the concepts relate and are grounded in the user's uploaded doctoral dissertation or primary research",
  "keyConstructs": ["Construct A: definition/aspect", "Construct B: definition/aspect"],
  "theoreticalAssumptions": ["Assumption 1", "Assumption 2"],
  "reusableArguments": ["Argument A", "Argument B"],
  "relevantCitations": ["Citation idea A", "Citation idea B"],
  "consistentTerminology": ["Term 1", "Term 2"],
  "philosophicalAnchors": "Theoretical framework summary bridging the user's primary thesis/research to this paper",
  "academicVoiceAdjustment": "Analyzes the requested style or material, providing instructions for maintaining consistency"
}`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.2,
      responseMimeType: "application/json",
      aiSettings
    });

    res.json(JSON.parse(responseText || "{}"));
  } catch (error: any) {
    console.error("Grounding error:", error);
    res.status(500).json({ error: error.message || "Failed to generate grounding map" });
  }
});

// Phase C: Research Data Discovery
app.post("/api/generate/data-discovery", aiAbuseLimit, async (req, res) => {
  try {
    const { title, methodology, field, keywords, aiSettings } = req.body;

    const systemInstruction = `You are a scholarly Research Data discovery system. 
Your purpose is to identify 3 to 4 open, free, authentic, and official databases or registries matching the research methodology. 
Provide real, authentic public source names (e.g. World Bank Open Data, IPUMS, UN Data, Kaggle Public Datasets, Harvard Dataverse, DOAJ, Pew Research center). 
Never suggest fictional or simulated databases. Label reliability and limitations objectively.`;

    const prompt = `Based on the following research parameters:
- Title: ${title || "Untitled Paper"}
- Methodology: ${methodology || ""}
- Discipline: ${field || ""}
- Keywords: ${keywords || ""}

Generate 3 to 4 high-quality public data source recommendations. Include both quantitative and qualitative options if appropriate.
Return strictly valid JSON in this format:
{
  "sources": [
    {
      "name": "Exact Name of Public Source (e.g. World Bank Open Data)",
      "url": "Authentic portal URL or locator identifier",
      "type": "Quantitative" or "Qualitative" or "Mixed",
      "relevance": "Direct explanation of why it is relevant to the proposed methodology and research questions",
      "reliability": "Assessment of data governance, official standing, peer-recognized trust",
      "limitations": "Inherent limitations of this public dataset (e.g., temporal coverage, geographical caps, self-reporting biases)"
    }
  ]
}`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.3,
      responseMimeType: "application/json",
      aiSettings
    });

    res.json(JSON.parse(responseText || "{}"));
  } catch (error: any) {
    console.error("Data discovery error:", error);
    res.status(500).json({ error: error.message || "Failed to discover data sources" });
  }
});

// Phase D: Journal Discovery
app.post("/api/generate/journal-discovery", aiAbuseLimit, async (req, res) => {
  try {
    const { title, keywords, field, preferredJournalScope, articleType, aiSettings } = req.body;

    const systemInstruction = `You are an academic Publishing Strategist and Bibliometric expert. 
Your objective is to find 3 to 4 candidate peer-reviewed academic journals indexed in Scopus, Web of Science, or DOAJ. 
Provide authentic, well-known academic journals. Focus on journals that do not charge high APC (Article Processing Charge) fees (prefer diamond open access or standard subscription journals with no submission fees if possible). 
Identify predatory indicators and rule out predatory journals entirely.`;

    const prompt = `Identify candidate journals for:
- Paper Title: ${title || "A dissertation-grounded study"}
- Keywords: ${keywords || ""}
- Target Field: ${field || ""}
- Desired Journal Scope/Vibe: ${preferredJournalScope || ""}
- Article Type: ${articleType || ""}

Generate a shortlist of exactly 3 to 4 reputable journals. Return strictly valid JSON matching this format:
{
  "journals": [
    {
      "name": "Official Journal Name (e.g., Journal of Cleaner Production)",
      "publisher": "Academic Publisher (e.g., Elsevier, Springer, Oxford University Press)",
      "scopeFit": "Critical analysis of why this paper fits the journal's aims and scope",
      "ranking": "Realistic indexing and rankings (e.g., Scopus Q1, WoS JIF, ABDC, SJR rating)",
      "feeStatus": "Accurate publication/APC fees (e.g. No APC to publish under standard subscription, or $0 Open Access, or specific APC)",
      "submissionOpenness": "General turnaround speed and open call info",
      "reviewContext": "Likely peer review context (double-blind, constructive, rigorous, etc.)",
      "whyFit": "Main strategic reason for choosing this journal"
    }
  ]
}`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.3,
      responseMimeType: "application/json",
      aiSettings
    });

    res.json(JSON.parse(responseText || "{}"));
  } catch (error: any) {
    console.error("Journal discovery error:", error);
    res.status(500).json({ error: error.message || "Failed to discover journals" });
  }
});

// Phase E: Journal Requirements Compliance Setup
app.post("/api/generate/extract-requirements", aiAbuseLimit, async (req, res) => {
  try {
    const { journalName, guidelinesText, aiSettings } = req.body;

    const systemInstruction = `You are a meticulous Journal Compliance Auditor. Your job is to convert raw author guidelines, or standard requirements of highly recognized publishers, into a structured, executable formatting & style checklist. Ensure exact, clear compliance criteria are outlined.`;

    const prompt = `Synthesize formatting and workflow rules for:
Journal Name: ${journalName}
Raw Instructions excerpt provided: ${guidelinesText || "None - generate standard guidelines for a premier peer-reviewed journal in this field (Elsevier/Springer format)"}

Produce a high-fidelity checklists and internal compliance guidelines in JSON format. Return strictly valid JSON containing:
{
  "wordCountGoal": "Word count limit or recommendation (e.g., 6000-8000 words)",
  "citationStyle": "Citation Style (e.g., APA 7th, Harvard, IEEE, Chicago)",
  "formattingRules": ["Double spaced, 12pt Times New Roman, margins", "Line numbers included", "Header formatting requirements"],
  "sectionStructure": ["Title Page", "Abstract & Keywords", "Introduction", "Literature Review / Related Work", "Conceptual / Ethical Framework", "Methodology / Methods", "Results / Analysis", "Discussion (including ethical implications and limitations)", "Conclusion", "Declarations (Funding, Conflicts of Interest, Ethical Approval, Consent, Data Availability)", "References", "Appendices (if applicable)"],
  "abstractRequirements": "Max word count (e.g., 150-250), structure rules (e.g. structured, graphical abstract info)",
  "referencesRequirement": "Specific references/bib format rules",
  "ethicalDisclosure": "Standard statement requirements (no conflict of interest, funding details)",
  "coverLetterNecessity": "Whether a cover letter is mandatory and what key points are typically required"
}`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.2,
      responseMimeType: "application/json",
      aiSettings
    });

    res.json(JSON.parse(responseText || "{}"));
  } catch (error: any) {
    console.error("Requirements extraction error:", error);
    res.status(500).json({ error: error.message || "Failed to extract journal rules" });
  }
});

// Phase F: Manuscript Section Co-Drafting Agent
app.post("/api/generate/draft-section", aiAbuseLimit, async (req, res) => {
  try {
    const {
      projectState,         // Title, RQs, Gap, Methodology, Journal, GroundingMap etc
      sectionName,          // e.g. "Introduction", "Literature Review", "Conceptual Framework"
      sectionOutline,       // Detailed bullet outline
      userStyleSample,      // Sample text to mimic user tone
      includeScriptures,    // Boolean - whether to integrate classical Indian philosophy/ethics/Vedas if relevant
      draftInstruction      // Custom instruction (e.g., "focus on construct X", "extend section 2")
    } = req.body;

    const aiSettings = projectState?.aiSettings;

    const groundingInfo = projectState.groundingMap ? `
--- Dissertation Anchors & Key Constructs ---
Conceptual Framework: ${projectState.groundingMap.conceptualFramework}
Key Constructs: ${JSON.stringify(projectState.groundingMap.keyConstructs)}
Reusable Arguments: ${JSON.stringify(projectState.groundingMap.reusableArguments)}
Consistent Terminology: ${JSON.stringify(projectState.groundingMap.consistentTerminology)}
` : "";

    const userStyleContext = userStyleSample ? `
--- User Style Reference ---
Mimic the vocabulary density, sentence progression, scholarly pacing, and tone of this text:
"${userStyleSample}"
` : "";

    const scriptureInstruction = includeScriptures ? `
--- Philosophical & Scriptural Support Mandate ---
All generated or refined sections MUST include supporting Sanskrit verses (in Roman transliteration or neat English synthesis) and citations from authentic, genuine Hindu scriptures such as the Vedas (Rigveda, Yajurveda, Samaveda, Atharvaveda), major Upanishads (e.g., Isa, Katha, Chandogya, Mundaka, Brihadaranyaka), Bhagavad Gita, and statecraft treatises (Kautilya's Arthashastra). 
Every scripture support MUST use authentic sources and specify genuine verses and citations (e.g., Isavasya Upanishad, Verse 1; Rigveda, 10.191.2; Bhagavad Gita, 2.47; Arthashastra, 1.19.34). These verses must be analytically and seamlessly integrated into the academic argument.
` : `Do not inject any verses or scriptures into this output unless they are directly part of the literature review already requested by the outline.`;

    const systemInstruction = `You are an elite, human-sounding Academic Writing Agent with years of successful publish-or-perish journal placements. 
Your tone is sophisticated, precise, deeply analytical, and fluid. You write without robotic filler phrases, artificial buzzwords (do NOT overuse 'revolutionize', 'testament', 'beacon', 'moreover', 'delve', 'demystify'), or repetitive transitions. 
Ensure you maintain extreme conceptual continuity with the user's underlying doctoral dissertation or research documents uploaded to the Knowledge Vault, and cite them substantially in all drafts as the foundational conceptual framework.`;

    const prompt = `Draft or refine the "${sectionName}" section of our manuscript.

--- Manuscript Details ---
Title: ${projectState.title}
Objectives: ${projectState.objectives}
Research Questions: ${projectState.researchQuestions}
Research Gap: ${projectState.researchGap}
Methodology: ${projectState.methodology}
Target Journal: ${projectState.targetJournal?.name || "Academic Journal"} (Citation style: ${projectState.complianceRules?.citationStyle || "APA 7th"})

${groundingInfo}
${userStyleContext}
${scriptureInstruction}

--- Section Instructions ---
Outline/Subsections requested:
${sectionOutline || "Standard flow for " + sectionName}

Custom Guidance for this turn:
${draftInstruction || "Write/complete the subsection with scholarly density and appropriate citations."}

Drafting Rules: 
1. Treat the user's uploaded doctoral dissertation and research materials in the Knowledge Vault as the foundational conceptual framework, citing them appropriately in the body.
2. Begin by clearly identifying where corresponding dissertation material is being leveraged or extended (e.g., "[Dissertation Reference Note: This section maps directly to and builds upon Chapter 3, Section 3.2 of the doctoral thesis to maintain theoretical rigor.]") before writing the main academic text.
3. Integrate authentic Sanskrit/Vedic/Upanishadic scriptural verses with precise and real historical citation tags (e.g., Rigveda 10.191.2).

Write the draft section in full, ready-to-publish academic prose. Do not leave placeholder text or summarized notes.`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.4,
      aiSettings
    });

    res.json({ draftText: responseText });
  } catch (error: any) {
    console.error("Drafting error:", error);
    res.status(500).json({ error: error.message || "Failed to generate section draft" });
  }
});

// Phase G: Quality Control (QC) Agent
app.post("/api/generate/quality-control", aiAbuseLimit, async (req, res) => {
  try {
    const { projectState, currentDraft } = req.body;
    const aiSettings = projectState?.aiSettings;

    const systemInstruction = `You are a ruthless, expert Peer Reviewer and Journal Editor acting as a Quality Control Agent. 
Your objective is to evaluate the drafted paper for:
1. Strict alignment with the core doctoral dissertation framework.
2. Compliance with target journal guidelines and citation style.
3. Logical reasoning, lack of cliché AI style patterns, academic rigor, and style consistency.
Provide constructive, direct, scholarly scores and highly actionable edits.`;

    const prompt = `Perform a comprehensive QC Audit of the current manuscript draft:

--- Manuscript Details ---
Title: ${projectState.title}
Target Journal: ${projectState.targetJournal?.name || "Peer-Reviewed Journal"}
Required Style: ${projectState.complianceRules?.citationStyle || "APA 7th"}
Expected word count: ${projectState.complianceRules?.wordCountGoal || "Standard"}

--- Formatting Rules to verify ---
${JSON.stringify(projectState.complianceRules?.formattingRules || [])}

--- Current manuscript draft content to evaluate ---
${currentDraft || "No text compiled yet."}

Compile a comprehensive evaluation in JSON. Return strictly valid JSON with formatting:
{
  "complianceScore": 85, // out of 100
  "rigorScore": 90, // out of 100
  "alignmentWithDissertationScore": 95, // out of 100
  "plagiarismOriginalityCheck": "Summary of stylistic authenticity and distinct academic voice",
  "strengths": ["Strength A", "Strength B"],
  "weaknesses": ["Weakness A", "Weakness B"],
  "actionableEditsPlan": ["Specific issue and how to resolve it", "Another specific styling correction needed"],
  "citationAudit": "Check on format completeness, in-text citations vs references list consistency",
  "ethicalVerification": "Confirm whether the required disclosures, conflict of interest, and funding details are clean"
}`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.2,
      responseMimeType: "application/json",
      aiSettings
    });

    res.json(JSON.parse(responseText || "{}"));
  } catch (error: any) {
    console.error("QC audit error:", error);
    res.status(500).json({ error: error.message || "Failed to perform QC audit" });
  }
});

// Phase H: Compilation & Submission Pack Generator (Cover Letter)
app.post("/api/generate/submission-pack", aiAbuseLimit, async (req, res) => {
  try {
    const { projectState, authorDetails, revisionsStatus } = req.body;
    const aiSettings = projectState?.aiSettings;

    const systemInstruction = `You are a professional Academic submission advisor. Your goal is to draft a highly polished, respectful, and compelling Cover Letter to the Editors-in-Chief of peer journals, and construct a robust pre-flight checklist.`;

    const prompt = `Prepare a complete submission package for:
- Paper Title: ${projectState.title}
- Target Journal: ${projectState.targetJournal?.name || "Top Peer Journal"}
- Aim & Editorial Vibe: ${projectState.targetJournal?.whyFit || "High relevance"}
- Author Profile: ${authorDetails || "Doctoral Scholar"}
- Current revisions/status: ${revisionsStatus || "Final First Submission"}

Generate a comprehensive "Submission Package" in JSON. Return strictly valid JSON containing:
{
  "coverLetter": "Full-text formal, persuasive cover letter to the journal Editor-in-Chief highlighting the paper's contribution, dissertation backing, and alignment with the journal's scope.",
  "submissionChecklist": ["Pre-flight check list item 1 (title page anonymity, blind review check)", "Pre-flight item 2 (figures dpi limit check)", "Pre-flight item 3 (copyright/conflict check)"],
  "complianceSummary": "Summary of word counts, template details, and how we checked off every rule of the journal",
  "responseToReviewersDraft": "A template/framework for a response letter to reviewers for if revisions are requested later"
}`;

    const responseText = await generateWithSettings({
      systemInstruction,
      prompt,
      temperature: 0.3,
      responseMimeType: "application/json",
      aiSettings
    });

    res.json(JSON.parse(responseText || "{}"));
  } catch (error: any) {
    console.error("Submission pack error:", error);
    res.status(500).json({ error: error.message || "Failed to generate submission materials" });
  }
});

// Expert Academic Citation Engine
app.post("/api/generate/citation-engine", aiAbuseLimit, async (req, res) => {
  try {
    const { sourceInput, desiredStyle, aiSettings } = req.body;

    const systemInstruction = `You are an expert academic citation engine. Your goal is to accurately format bibliographic references and in-text citations based on user-provided source information or URLs.
Follow these rules strictly:
1. Identify the Source Type: Determine if the input is a book, journal article, website, report, thesis/dissertation, or other media.
2. Standardize the Output: Format strictly according to the requested citation style (${desiredStyle || "APA 7th"}).
3. Handle Incomplete Data: Extract all possible information (Author, Publication Date, Title, Publisher/Website Name, DOI/URL).
4. Format Structure: Provide full bibliographic entry, parenthetical in-text citation, narrative in-text citation, and BibTeX snippet.
5. Validation: If any required element (e.g. author name, date, DOI) is missing and cannot be found, flag it clearly in validationWarnings.`;

    const prompt = `Analyze and format the following academic source information or URL:
--- INPUT ---
${sourceInput}
--- END ---

Desired Citation Style: ${desiredStyle || "APA 7th"}

Return strictly valid JSON in this exact structure:
{
  "sourceType": "Journal Article" or "Book" or "Website" or "Report" or "Thesis/Dissertation" or "Other Media",
  "style": "${desiredStyle || "APA 7th"}",
  "fullReference": "Full bibliographic reference list entry formatted properly",
  "inTextParenthetical": "Parenthetical in-text citation format e.g. (Smith, 2026)",
  "inTextNarrative": "Narrative in-text citation format e.g. Smith (2026)",
  "bibtex": "Valid BibTeX entry string",
  "validationWarnings": ["Warning list if required elements like Author, Date, or DOI are missing"],
  "extractedMetadata": {
    "title": "Extracted title",
    "author": "Extracted author(s)",
    "year": "Extracted publication year",
    "publisherOrJournal": "Extracted publisher or journal name",
    "doiOrUrl": "Extracted DOI or URL"
  }
}`;

    if (aiSettings?.aiReadiness === "simulated") {
      const isUrl = sourceInput.includes("http");
      return res.json({
        sourceType: isUrl ? "Website" : "Journal Article",
        style: desiredStyle || "APA 7th",
        fullReference: isUrl 
          ? `Academic Researcher. (2026). Scholarly resource retrieved from ${sourceInput.slice(0, 40)}... Journal of Academic Grounding, 12(3), 45-60.`
          : `Smith, J. A., & Doe, R. B. (2026). ${sourceInput.slice(0, 50)}. Journal of Doctoral Research & Innovation, 14(2), 112-128. https://doi.org/10.1016/j.jdri.2026.01.004`,
        inTextParenthetical: "(Smith & Doe, 2026)",
        inTextNarrative: "Smith and Doe (2026)",
        bibtex: `@article{Smith2026,\n  author = {Smith, J. A. and Doe, R. B.},\n  title = {${sourceInput.slice(0, 40)}...},\n  journal = {Journal of Doctoral Research & Innovation},\n  year = {2026},\n  volume = {14},\n  pages = {112--128}\n}`,
        validationWarnings: isUrl ? ["Missing DOI: URL provided without permanent DOI resolver."] : [],
        extractedMetadata: {
          title: sourceInput.slice(0, 60),
          author: "Smith, J. A., & Doe, R. B.",
          year: "2026",
          publisherOrJournal: "Journal of Doctoral Research & Innovation",
          doiOrUrl: isUrl ? sourceInput : "https://doi.org/10.1016/j.jdri.2026.01.004"
        }
      });
    }

    const responseText = await generateWithSettings({ prompt, systemInstruction, temperature: 0.2, aiSettings });
    let parsed: any;
    try {
      const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      parsed = {
        sourceType: "Journal Article",
        style: desiredStyle || "APA 7th",
        fullReference: responseText,
        inTextParenthetical: "(Author, Year)",
        inTextNarrative: "Author (Year)",
        bibtex: `@misc{ref,\n  note = {${responseText.slice(0, 100)}...}\n}`,
        validationWarnings: ["Could not parse structured citation metadata perfectly."],
        extractedMetadata: { title: sourceInput.slice(0, 50), author: "Researcher", year: "2026" }
      };
    }

    res.json(parsed);
  } catch (error: any) {
    console.error("Citation engine error:", error);
    res.status(500).json({ error: error.message || "Failed to generate citation formatting" });
  }
  });
}
