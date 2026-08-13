/**
 * Local AI runner catalog — the programs a user can install on their own
 * computer to run models locally.
 *
 * Why this file exists (2026-07-31): the app previously knew about exactly two
 * local runners (Ollama, and "custom" standing in for LM Studio and everything
 * else), with their ports and install steps scattered between
 * src/config/aiModes.ts and src/services/aiGateway.ts. Adding a runner now
 * means adding one entry here.
 *
 * Like providerCatalog.ts this module is imported by both the browser bundle
 * and server.ts, so it must contain pure data and pure functions only — no
 * browser globals, no Node built-ins.
 *
 * The single most common reason local AI "won't connect" is not a wrong port —
 * it is the runner refusing the browser's cross-origin request. A page served
 * from https://<this app> calling http://localhost:11434 is a cross-origin
 * request, so the runner must return an `Access-Control-Allow-Origin` header
 * or the browser discards the response before this app ever sees it. Every
 * entry below therefore carries a `corsGuidance` string with the real, runner-
 * specific way to allow it — this is surfaced directly in the diagnostics UI
 * rather than buried in docs.
 *
 * (Browsers treat http://localhost and http://127.0.0.1 as trustworthy
 * origins for classic mixed-content purposes, so mixed-content blocking is
 * not the whole story — CORS is the bigger piece of it. But as of Chrome 142
 * (2025-10-28), that is no longer the complete picture either: Local Network
 * Access (LNA) is a distinct, newer restriction gating ANY fetch from a
 * public-address-space page to a loopback/private-network target, requiring
 * both a one-time browser permission grant and an
 * `Access-Control-Allow-Private-Network: true` response header IN ADDITION
 * to the Access-Control-Allow-Origin corsGuidance below already covers. See
 * src/services/localRuntimeConnectivity.ts for the LNA-aware diagnosis this
 * file's corsGuidance strings don't by themselves capture.)
 */

export type LocalApiStyle = "ollama-native" | "openai-compatible";

export interface LocalRunnerSpec {
  /** Stable id used in AISettings.localRunner */
  id: string;
  name: string;
  /** Which adapter handles it: Ollama has its own API shape, everything else is OpenAI-compatible */
  apiStyle: LocalApiStyle;
  /** Address the runner listens on out of the box, no trailing slash */
  defaultEndpoint: string;
  /** Path (relative to defaultEndpoint) that lists loaded models — used for detection */
  healthPath: string;
  description: string;
  /** Real install/launch steps — never a generic placeholder */
  installGuidance: string;
  installUrl: string;
  /** How to let this app's origin talk to the runner */
  corsGuidance: string;
  /** Rough difficulty so the UI can steer beginners to the easy ones */
  difficulty: "Easy" | "Moderate" | "Advanced";
  /** True for runners with a graphical interface (friendlier for non-technical users) */
  hasGui: boolean;
  icon: string;
}

export const LOCAL_RUNNERS: LocalRunnerSpec[] = [
  {
    id: "ollama",
    name: "Ollama",
    apiStyle: "ollama-native",
    defaultEndpoint: "http://localhost:11434",
    healthPath: "/api/tags",
    description: "The most popular option — one command to install, one to download a model.",
    installGuidance:
      "Install Ollama, then run `ollama pull llama3.1:8b` in a terminal. Ollama starts its server automatically at localhost:11434.",
    installUrl: "https://ollama.com/download",
    corsGuidance:
      "Ollama blocks browser requests from other origins by default. Set the environment variable OLLAMA_ORIGINS=* (or to this app's exact address) and restart Ollama. On macOS: `launchctl setenv OLLAMA_ORIGINS \"*\"` then restart the Ollama app.",
    difficulty: "Easy",
    hasGui: false,
    icon: "🦙",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:1234/v1",
    healthPath: "/models",
    description: "Friendly desktop app with a built-in model browser — the easiest option with a real interface.",
    installGuidance:
      "Install the LM Studio desktop app, download a model from its built-in browser, then open the 'Local Server' tab and press Start. It listens on localhost:1234.",
    installUrl: "https://lmstudio.ai/download",
    corsGuidance:
      "In LM Studio's Local Server tab, enable the 'Enable CORS' toggle before starting the server.",
    difficulty: "Easy",
    hasGui: true,
    icon: "🖥",
  },
  {
    id: "jan",
    name: "Jan.ai",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:1337/v1",
    healthPath: "/models",
    description: "Open-source desktop app, similar to LM Studio, with a fully local model hub.",
    installGuidance:
      "Install Jan, download a model from its Hub tab, then go to Settings → Local API Server and start it. It listens on localhost:1337.",
    installUrl: "https://jan.ai/download",
    corsGuidance:
      "In Jan's Settings → Local API Server, enable CORS before starting the server.",
    difficulty: "Easy",
    hasGui: true,
    icon: "🌐",
  },
  {
    id: "localai",
    name: "LocalAI",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:8080/v1",
    healthPath: "/models",
    description: "Self-hosted drop-in replacement for the OpenAI API — runs well in Docker.",
    installGuidance:
      "Easiest via Docker: `docker run -p 8080:8080 --name local-ai localai/localai:latest`. It exposes an OpenAI-compatible API on localhost:8080.",
    installUrl: "https://localai.io/basics/getting_started/",
    corsGuidance:
      "Start LocalAI with the environment variable LOCALAI_CORS=true (add `-e LOCALAI_CORS=true` to the docker run command).",
    difficulty: "Moderate",
    hasGui: false,
    icon: "📦",
  },
  {
    id: "llamacpp",
    name: "llama.cpp server",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:8080/v1",
    healthPath: "/models",
    description: "The reference C++ engine most other runners are built on — leanest resource use.",
    installGuidance:
      "Build or download llama.cpp, then run `llama-server -m /path/to/model.gguf --port 8080`. Note it uses the same default port as LocalAI, so run only one at a time.",
    installUrl: "https://github.com/ggml-org/llama.cpp",
    corsGuidance:
      "llama-server allows cross-origin requests by default. If you put it behind a reverse proxy, that proxy must forward the Access-Control-Allow-Origin header.",
    difficulty: "Advanced",
    hasGui: false,
    icon: "⚙",
  },
  {
    id: "koboldcpp",
    name: "KoboldCPP",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:5001/v1",
    healthPath: "/models",
    description: "Single-file runner with a built-in interface — no install step beyond downloading it.",
    installGuidance:
      "Download the single KoboldCPP executable, run it, and pick a .gguf model file when prompted. It listens on localhost:5001.",
    installUrl: "https://github.com/LostRuins/koboldcpp/releases",
    corsGuidance:
      "KoboldCPP permits cross-origin requests by default; no extra configuration is normally needed.",
    difficulty: "Easy",
    hasGui: true,
    icon: "🐉",
  },
  {
    id: "vllm",
    name: "vLLM",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:8000/v1",
    healthPath: "/models",
    description: "High-throughput server for machines with a capable NVIDIA GPU — fastest option at scale.",
    installGuidance:
      "Requires a CUDA-capable GPU. `pip install vllm`, then `vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000`.",
    installUrl: "https://docs.vllm.ai/en/latest/getting_started/installation.html",
    corsGuidance:
      "Start vLLM with `--allowed-origins '[\"*\"]'` (or your exact app address) so the browser's request is accepted.",
    difficulty: "Advanced",
    hasGui: false,
    icon: "⚡",
  },
  {
    id: "textgenwebui",
    name: "Text Generation WebUI",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:5000/v1",
    healthPath: "/models",
    description: "Also known as oobabooga — a feature-rich interface with many loader back-ends.",
    installGuidance:
      "Clone the repository and run its start script for your platform, then launch with the `--api` flag. The OpenAI-compatible API listens on localhost:5000.",
    installUrl: "https://github.com/oobabooga/text-generation-webui",
    corsGuidance:
      "Launch with `--api` and, if requests are refused, add `--api-enable-ipv6`/`--listen` as appropriate; put it behind a proxy that adds Access-Control-Allow-Origin if the browser still blocks it.",
    difficulty: "Advanced",
    hasGui: true,
    icon: "🎛",
  },
  {
    id: "omniroute",
    name: "OmniRoute",
    apiStyle: "openai-compatible",
    defaultEndpoint: "http://localhost:20128/v1",
    healthPath: "/models",
    description:
      "A local router that forwards to cloud providers with automatic fallback — runs locally, but the AI itself still runs in the cloud.",
    installGuidance:
      "Requires Node.js. Run `npm install -g omniroute`, then `omniroute` to start it. Its dashboard and local API both come up at localhost:20128.",
    installUrl: "https://www.npmjs.com/package/omniroute",
    corsGuidance:
      "OmniRoute permits cross-origin requests by default; if blocked, check its dashboard's access settings.",
    difficulty: "Moderate",
    hasGui: true,
    icon: "⇄",
  },
];

const RUNNER_BY_ID: Record<string, LocalRunnerSpec> = Object.fromEntries(
  LOCAL_RUNNERS.map((r) => [r.id, r])
);

export function getLocalRunner(id: string): LocalRunnerSpec | undefined {
  return RUNNER_BY_ID[id];
}

/** Endpoint with any trailing slash removed, honouring a user override. */
export function resolveRunnerEndpoint(spec: LocalRunnerSpec, override?: string): string {
  const raw = (override || spec.defaultEndpoint).trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function runnerHealthUrl(spec: LocalRunnerSpec, override?: string): string {
  return `${resolveRunnerEndpoint(spec, override)}${spec.healthPath}`;
}

export function runnerChatUrl(spec: LocalRunnerSpec, override?: string): string {
  const base = resolveRunnerEndpoint(spec, override);
  return spec.apiStyle === "ollama-native" ? `${base}/api/chat` : `${base}/chat/completions`;
}

/** Runners worth probing during auto-detection, cheapest/most-likely first. */
export function getDetectableRunners(): LocalRunnerSpec[] {
  return LOCAL_RUNNERS;
}
