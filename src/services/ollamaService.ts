/**
 * Ollama Service & Connection Manager for Scholar Core.
 *
 * Provides comprehensive, self-diagnosing, and automated integration with local
 * Ollama instances running on the user's machine (macOS, Linux, Windows).
 *
 * Complies with modern browser security, loopback origin exemptions,
 * and Chrome Local Network Access (LNA) standards.
 */

export interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at?: string;
  details?: OllamaModelDetails;
  isLocal: boolean;
  isCloud: boolean;
  category: "coding" | "reasoning" | "vision" | "general";
  formattedSize: string;
}

export type OllamaErrorKind =
  | "SUCCESS"
  | "OLLAMA_NOT_RUNNING"
  | "CORS_MISCONFIGURED"
  | "LOCAL_NETWORK_PERMISSION_REQUIRED"
  | "MIXED_CONTENT_BLOCKED"
  | "NO_MODELS_INSTALLED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "MALFORMED_ENDPOINT"
  | "UNKNOWN";

export interface OllamaDiagnosticCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warning" | "pending";
  detail?: string;
}

export interface OllamaDiagnosisResult {
  ok: boolean;
  errorKind: OllamaErrorKind;
  activeEndpoint: string;
  testedEndpoints: string[];
  version: string | null;
  models: OllamaModelInfo[];
  recommendedModel: string | null;
  checks: OllamaDiagnosticCheck[];
  os: "macos" | "windows" | "linux" | "unknown";
  browser: "chrome" | "edge" | "safari" | "firefox" | "brave" | "unknown";
  browserVersion: string;
  currentOrigin: string;
  requiredOriginCommand: string;
  guidance: string;
  actionableSteps: string[];
  latencyMs?: number;
}

const DEFAULT_OLLAMA_PORT = 11434;
export const DEFAULT_OLLAMA_ENDPOINT = `http://localhost:${DEFAULT_OLLAMA_PORT}`;
export const FALLBACK_OLLAMA_ENDPOINT = `http://127.0.0.1:${DEFAULT_OLLAMA_PORT}`;

/** Format raw bytes into human-readable MB / GB */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

/** Detect user OS from userAgent / platform */
export function detectUserOS(): "macos" | "windows" | "linux" | "unknown" {
  if (typeof navigator === "undefined") return "macos";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || navigator.platform?.toLowerCase() || "";
  if (platform.includes("mac") || ua.includes("macintosh") || ua.includes("mac os x")) return "macos";
  if (platform.includes("win") || ua.includes("windows")) return "windows";
  if (platform.includes("linux") || ua.includes("linux")) return "linux";
  return "unknown";
}

/** Detect user browser name and major version */
export function detectUserBrowser(): { name: "chrome" | "edge" | "safari" | "firefox" | "brave" | "unknown"; version: string } {
  if (typeof navigator === "undefined") return { name: "chrome", version: "" };
  const ua = navigator.userAgent;
  if (/Edg\/(\d+)/.test(ua)) {
    const match = ua.match(/Edg\/(\d+[\.\d]*)/);
    return { name: "edge", version: match ? match[1] : "" };
  }
  if ((navigator as any).brave) {
    const match = ua.match(/Chrome\/(\d+[\.\d]*)/);
    return { name: "brave", version: match ? match[1] : "" };
  }
  if (/Chrome\/(\d+)/.test(ua)) {
    const match = ua.match(/Chrome\/(\d+[\.\d]*)/);
    return { name: "chrome", version: match ? match[1] : "" };
  }
  if (/Firefox\/(\d+)/.test(ua)) {
    const match = ua.match(/Firefox\/(\d+[\.\d]*)/);
    return { name: "firefox", version: match ? match[1] : "" };
  }
  if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) {
    const match = ua.match(/Version\/(\d+[\.\d]*)/);
    return { name: "safari", version: match ? match[1] : "" };
  }
  return { name: "unknown", version: "" };
}

/** Get the current web application origin (e.g. https://scholar.gkshah.com.np) */
export function getCurrentAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://scholar.gkshah.com.np";
}

/** Generate tailored 1-click terminal setup command for the user's OS */
export function getOllamaOriginSetupCommand(os: "macos" | "windows" | "linux" | "unknown", origin: string): string {
  switch (os) {
    case "macos":
      return `launchctl setenv OLLAMA_ORIGINS "${origin}" && pkill ollama || true && open -a Ollama`;
    case "linux":
      return `systemctl --user set-environment OLLAMA_ORIGINS="${origin}" && systemctl --user restart ollama || OLLAMA_ORIGINS="${origin}" ollama serve`;
    case "windows":
      return `setx OLLAMA_ORIGINS "${origin}"`;
    default:
      return `OLLAMA_ORIGINS="${origin}" ollama serve`;
  }
}

/** Categorize Ollama model into task specialty */
export function categorizeModel(modelName: string): "coding" | "reasoning" | "vision" | "general" {
  const lower = modelName.toLowerCase();
  if (lower.includes("code") || lower.includes("coder") || lower.includes("starcoder") || lower.includes("dev")) {
    return "coding";
  }
  if (lower.includes("r1") || lower.includes("reason") || lower.includes("qwq") || lower.includes("deepseek-r")) {
    return "reasoning";
  }
  if (lower.includes("vision") || lower.includes("llava") || lower.includes("bakllava") || lower.includes("moondream")) {
    return "vision";
  }
  return "general";
}

/** Determine if model is stored locally or references Ollama cloud */
export function isModelCloudRemote(modelName: string, rawModel: any): boolean {
  const lower = modelName.toLowerCase();
  if (lower.includes(":cloud") || lower.includes("-cloud") || lower.includes("/cloud")) return true;
  if (rawModel?.remote === true || rawModel?.cloud === true) return true;
  // If model size is 0 and no local digest, it's a remote pointer
  if (rawModel?.size === 0 && !rawModel?.digest) return true;
  return false;
}

/** Parse and enrich model list from /api/tags JSON */
export function parseOllamaModels(data: any): OllamaModelInfo[] {
  if (!data || !Array.isArray(data.models)) return [];

  return data.models.map((m: any) => {
    const name = m.name || m.model || "unknown";
    const size = typeof m.size === "number" ? m.size : 0;
    const isCloud = isModelCloudRemote(name, m);
    const isLocal = !isCloud;
    const category = categorizeModel(name);

    return {
      name,
      model: name,
      size,
      digest: m.digest || "",
      modified_at: m.modified_at,
      details: m.details,
      isLocal,
      isCloud,
      category,
      formattedSize: formatBytes(size),
    };
  });
}

/** Select the best recommended model for academic writing and research coding in Scholar Core */
export function selectRecommendedModel(models: OllamaModelInfo[]): string | null {
  if (models.length === 0) return null;

  // Priority order for academic/research tasks
  const preferredPatterns = [
    /qwen2\.5-coder/i,
    /deepseek-coder/i,
    /llama3\.1/i,
    /llama3\.2/i,
    /llama3/i,
    /mistral/i,
    /gemma2/i,
    /stable-code/i,
    /codellama/i,
    /qwen/i,
  ];

  for (const pattern of preferredPatterns) {
    const match = models.find((m) => m.isLocal && pattern.test(m.name));
    if (match) return match.name;
  }

  // Fallback to any local model
  const firstLocal = models.find((m) => m.isLocal);
  if (firstLocal) return firstLocal.name;

  return models[0].name;
}

/** Validate and normalize local endpoint URL */
export function normalizeOllamaEndpoint(endpoint?: string): string {
  if (!endpoint || !endpoint.trim()) return DEFAULT_OLLAMA_ENDPOINT;
  let clean = endpoint.trim();
  if (!/^https?:\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  return clean.replace(/\/+$/, "");
}

/** Test endpoint connectivity with standard timeout */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes Ollama reachability using no-cors mode to distinguish whether the process is listening
 * on the port even when CORS or Chrome LNA blocks the regular JSON read.
 */
export async function probeOllamaProcessListening(endpoint: string, timeoutMs = 2000): Promise<boolean> {
  try {
    await fetch(`${endpoint}/api/version`, {
      mode: "no-cors",
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    return true;
  } catch {
    try {
      await fetch(`${endpoint}/api/tags`, {
        mode: "no-cors",
        signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Primary Diagnostics Engine: Tests Ollama across candidate loopback addresses,
 * checks `/api/version` and `/api/tags`, parses installed models, and classifies any error.
 */
export async function diagnoseOllamaConnection(customEndpoint?: string): Promise<OllamaDiagnosisResult> {
  const os = detectUserOS();
  const { name: browser, version: browserVersion } = detectUserBrowser();
  const currentOrigin = getCurrentAppOrigin();
  const originCommand = getOllamaOriginSetupCommand(os, currentOrigin);

  const baseEndpoint = normalizeOllamaEndpoint(customEndpoint);
  
  // Build candidate endpoints (e.g. if user passed localhost, also test 127.0.0.1 in case of IPv6 resolution mismatch)
  const candidateEndpoints = [baseEndpoint];
  if (baseEndpoint.includes("localhost") && !candidateEndpoints.includes(FALLBACK_OLLAMA_ENDPOINT)) {
    candidateEndpoints.push(FALLBACK_OLLAMA_ENDPOINT);
  } else if (baseEndpoint.includes("127.0.0.1") && !candidateEndpoints.includes(DEFAULT_OLLAMA_ENDPOINT)) {
    candidateEndpoints.push(DEFAULT_OLLAMA_ENDPOINT);
  }

  let finalEndpoint = baseEndpoint;
  let version: string | null = null;
  let models: OllamaModelInfo[] = [];
  let latencyMs = 0;
  let isApiReachable = false;
  let lastThrownError: any = null;

  const startTime = Date.now();

  // Step 1: Attempt standard direct fetch on candidate endpoints
  for (const ep of candidateEndpoints) {
    try {
      const epStart = Date.now();
      // Try /api/version first
      try {
        const verRes = await fetchWithTimeout(`${ep}/api/version`, { method: "GET" });
        if (verRes.ok) {
          const verData = await verRes.json().catch(() => ({}));
          version = verData.version || null;
        }
      } catch (_) {}

      // Try /api/tags
      const tagsRes = await fetchWithTimeout(`${ep}/api/tags`, { method: "GET" });
      if (tagsRes.ok) {
        const data = await tagsRes.json();
        models = parseOllamaModels(data);
        finalEndpoint = ep;
        isApiReachable = true;
        latencyMs = Date.now() - epStart;
        break;
      }
    } catch (err: any) {
      lastThrownError = err;
    }
  }

  if (isApiReachable) {
    const recommendedModel = selectRecommendedModel(models);
    const checks: OllamaDiagnosticCheck[] = [
      { id: "server", label: "Ollama server active", status: "pass", detail: `Responding at ${finalEndpoint}` },
      { id: "origin", label: "CORS origin allowed", status: "pass", detail: `Origin ${currentOrigin} accepted` },
      { id: "api", label: "API endpoints responsive", status: "pass", detail: version ? `Ollama v${version}` : "v0.1+" },
      {
        id: "models",
        label: "Installed models",
        status: models.length > 0 ? "pass" : "warning",
        detail: models.length > 0 ? `${models.length} model(s) detected` : "No models found. Run `ollama pull qwen2.5-coder`",
      },
    ];

    return {
      ok: true,
      errorKind: models.length > 0 ? "SUCCESS" : "NO_MODELS_INSTALLED",
      activeEndpoint: finalEndpoint,
      testedEndpoints: candidateEndpoints,
      version,
      models,
      recommendedModel,
      checks,
      os,
      browser,
      browserVersion,
      currentOrigin,
      requiredOriginCommand: originCommand,
      guidance: models.length > 0
        ? `Connected to Ollama (${models.length} model${models.length === 1 ? "" : "s"} ready).`
        : `Ollama is connected, but has no models downloaded yet. Run \`ollama pull qwen2.5-coder\` in your terminal.`,
      actionableSteps: models.length > 0 ? [] : ["Open Terminal and run: `ollama pull qwen2.5-coder`", "Refresh models in Scholar Core."],
      latencyMs,
    };
  }

  // Step 2: If direct fetch failed, probe whether process is alive via no-cors
  const isProcessAlive = await probeOllamaProcessListening(baseEndpoint);

  if (isProcessAlive) {
    // Process is listening on the port, so the blockage is CORS or Browser Local Network Access
    const checks: OllamaDiagnosticCheck[] = [
      { id: "server", label: "Ollama server active", status: "pass", detail: `Process listening on ${baseEndpoint}` },
      { id: "origin", label: "CORS origin permission", status: "fail", detail: `Needs OLLAMA_ORIGINS="${currentOrigin}"` },
      { id: "api", label: "Browser access permission", status: "warning", detail: "Check Chrome address bar for Local Network permission" },
      { id: "models", label: "Model detection", status: "pending", detail: "Waiting for origin permission" },
    ];

    const actionableSteps = [
      `1. Set the allowed origin on your ${os === "macos" ? "Mac" : "computer"}:`,
      `   ${originCommand}`,
      `2. If Chrome shows a permission popup asking to "access devices on your local network", click Allow.`,
      `3. Click "Test connection" again.`,
    ];

    return {
      ok: false,
      errorKind: "CORS_MISCONFIGURED",
      activeEndpoint: baseEndpoint,
      testedEndpoints: candidateEndpoints,
      version: null,
      models: [],
      recommendedModel: null,
      checks,
      os,
      browser,
      browserVersion,
      currentOrigin,
      requiredOriginCommand: originCommand,
      guidance: `Ollama is running on your computer, but your browser is blocking requests from ${currentOrigin}. Configure OLLAMA_ORIGINS and restart Ollama.`,
      actionableSteps,
      latencyMs: Date.now() - startTime,
    };
  }

  // Step 3: Nothing listening on port -> Ollama is not running
  const checks: OllamaDiagnosticCheck[] = [
    { id: "server", label: "Ollama server active", status: "fail", detail: `No response at ${baseEndpoint}` },
    { id: "origin", label: "CORS origin permission", status: "pending", detail: "Requires running Ollama" },
    { id: "api", label: "API endpoints responsive", status: "pending", detail: "Unreachable" },
    { id: "models", label: "Model detection", status: "pending", detail: "Unreachable" },
  ];

  const actionableSteps = [
    `1. Launch the Ollama application or run \`ollama serve\` in your terminal.`,
    `2. Ensure Ollama allows Scholar Core by setting:`,
    `   ${originCommand}`,
    `3. Click "Test connection" once Ollama is running.`,
  ];

  return {
    ok: false,
    errorKind: "OLLAMA_NOT_RUNNING",
    activeEndpoint: baseEndpoint,
    testedEndpoints: candidateEndpoints,
    version: null,
    models: [],
    recommendedModel: null,
    checks,
    os,
    browser,
    browserVersion,
    currentOrigin,
    requiredOriginCommand: originCommand,
    guidance: `Could not reach Ollama at ${baseEndpoint}. Make sure Ollama is installed and running on your computer.`,
    actionableSteps,
    latencyMs: Date.now() - startTime,
  };
}

/** Formats a complete, sanitised diagnostic report for user copy/paste to support */
export function generateDiagnosticReport(diagnosis: OllamaDiagnosisResult): string {
  const timestamp = new Date().toISOString();
  return [
    `# Scholar Core — Ollama Diagnostics Report`,
    `Generated: ${timestamp}`,
    ``,
    `## Environment`,
    `- Web Origin: ${diagnosis.currentOrigin}`,
    `- Operating System: ${diagnosis.os}`,
    `- Browser: ${diagnosis.browser} ${diagnosis.browserVersion}`,
    `- Target Endpoint: ${diagnosis.activeEndpoint}`,
    `- Ollama Version: ${diagnosis.version || "Undetected"}`,
    `- Status: ${diagnosis.errorKind}`,
    `- Latency: ${diagnosis.latencyMs ? `${diagnosis.latencyMs}ms` : "N/A"}`,
    ``,
    `## Health Checks`,
    ...diagnosis.checks.map((c) => `- [${c.status.toUpperCase()}] ${c.label}: ${c.detail || ""}`),
    ``,
    `## Models Detected (${diagnosis.models.length})`,
    ...(diagnosis.models.length > 0
      ? diagnosis.models.map((m) => `- ${m.name} (${m.formattedSize}, ${m.category}, ${m.isLocal ? "Local" : "Cloud"})`)
      : [`- None detected`]),
    ``,
    `## Recommended Origin Configuration Command (${diagnosis.os})`,
    `\`\`\`bash`,
    diagnosis.requiredOriginCommand,
    `\`\`\``,
  ].join("\n");
}
