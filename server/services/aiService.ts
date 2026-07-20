import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";

let requestCount = 0;

function selectGeminiKey(clientKey?: string): string {
  if (clientKey && clientKey !== "defined_on_server" && clientKey !== "") {
    return clientKey;
  }
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY_2,
  ].filter(Boolean) as string[];

  if (keys.length === 0) return "";

  const selected = keys[requestCount % keys.length];
  requestCount++;
  return selected;
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
      },
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
          { role: "user", content: fullPrompt },
        ],
        stream: false,
        options: {
          temperature: params.temperature,
        },
      }),
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
          { role: "user", content: fullPrompt },
        ],
        temperature: params.temperature,
      }),
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

// Local request memory cache
const requestCache = new Map<string, { timestamp: number; response: any }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache expiration

function getCacheKey(body: any): string {
  const str = JSON.stringify({
    provider: body.provider,
    model: body.model,
    systemInstruction: body.systemInstruction,
    prompt: body.prompt,
    temperature: body.temperature,
    responseMimeType: body.responseMimeType,
  });
  return crypto.createHash("sha256").update(str).digest("hex");
}

const sendCachedJson = (res: any, cacheKey: string, payload: any) => {
  requestCache.set(cacheKey, { timestamp: Date.now(), response: payload });
  return res.json(payload);
};

export {
  requestCount,
  selectGeminiKey,
  getGeminiClient,
  generateContentWithRetry,
  cleanJsonString,
  generateWithSettings,
  requestCache,
  CACHE_TTL_MS,
  getCacheKey,
  sendCachedJson,
};