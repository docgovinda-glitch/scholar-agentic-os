/**
 * Hardware detection and local-model recommendations (Section 7 of the AI
 * Access architecture).
 *
 * Honesty constraint, stated up front because it shapes every function
 * here: browsers do not expose real hardware access. `navigator.deviceMemory`
 * is capped and bucketed by the browser itself for fingerprinting resistance
 * (Chrome reports at most 8, regardless of actual RAM), Safari and Firefox
 * don't implement it at all, and there is no browser API for VRAM. Every
 * detected value is therefore a best-effort estimate, and every consumer of
 * this module — UI included — must say so rather than present a number as
 * measured fact. `detectionMethod` on the returned profile exists so the UI
 * can render "~16 GB (browser estimate)" instead of "16 GB".
 *
 * Local runtime/model detection reuses src/services/localRunnerProbe.ts
 * rather than re-implementing it — that module already solves the CORS and
 * mixed-content subtleties of reaching http://localhost from this https
 * page.
 */

import { LOCAL_RUNNERS } from "../config/localRunnerCatalog";
import { probeRunner } from "./localRunnerProbe";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

export interface HardwareProfile {
  os: string | null;
  cpuCores: number | null;
  architecture: string | null;
  ramGb: number | null;
  gpuInfo: string | null;
  vramGb: number | null;
  storageFreeGb: number | null;
  detectedRuntimes: Array<{ id: string; name: string; models: string[] }>;
  detectionMethod: "browser-api" | "manual";
  detectedAt: string;
}

function detectOs(): string | null {
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) return uaData.platform as string;
  const ua = navigator.userAgent;
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  return null;
}

function detectArchitecture(): string | null {
  const ua = navigator.userAgent;
  if (/arm64|aarch64/i.test(ua)) return "arm64";
  // Apple Silicon Macs report "Intel" in the UA string for compatibility —
  // the only browser-visible tell is WebGL's renderer string, which
  // detectGpu() below captures separately when available.
  if (/x86_64|Win64|WOW64/i.test(ua)) return "x86_64";
  return null;
}

/** Best-effort GPU identification via the WebGL renderer string — the only cross-browser signal available; WebGPU adapter info is Chromium-only and still doesn't expose VRAM. */
function detectGpu(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === "string" ? renderer : null;
  } catch {
    return null;
  }
}

async function detectStorageFreeGb(): Promise<number | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined || usage === undefined) return null;
    // This is the browser's own storage quota, not the disk's actual free
    // space — the closest signal a web page can read at all. Documented in
    // the field name and surfaced as such in the UI, not silently equated
    // with disk space.
    return Math.round(((quota - usage) / 1024 ** 3) * 10) / 10;
  } catch {
    return null;
  }
}

async function detectLocalRuntimes(): Promise<HardwareProfile["detectedRuntimes"]> {
  const results = await Promise.all(
    LOCAL_RUNNERS.map(async (runner) => {
      const result = await probeRunner(runner);
      return result.reachable ? { id: runner.id, name: runner.name, models: result.models } : null;
    })
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

export async function detectHardwareProfile(): Promise<HardwareProfile> {
  const [detectedRuntimes, storageFreeGb] = await Promise.all([detectLocalRuntimes(), detectStorageFreeGb()]);

  return {
    os: detectOs(),
    cpuCores: navigator.hardwareConcurrency ?? null,
    architecture: detectArchitecture(),
    // Chrome/Edge only; capped at 8 by the browser regardless of actual RAM.
    ramGb: (navigator as any).deviceMemory ?? null,
    gpuInfo: detectGpu(),
    vramGb: null, // No browser API exposes this at all.
    storageFreeGb,
    detectedRuntimes,
    detectionMethod: "browser-api",
    detectedAt: new Date().toISOString(),
  };
}

export interface ModelRecommendation {
  sizeClass: string;
  reasoning: string;
  warnings: string[];
}

/**
 * Rule-based, not a benchmark: recommends a model SIZE CLASS from detected
 * RAM, and explains why. Never claims a specific tokens/sec figure — Section
 * 7 rules that out explicitly ("do not promise... unless verified"), and
 * nothing here has run a real benchmark.
 */
export function recommendLocalModel(profile: HardwareProfile): ModelRecommendation {
  const warnings: string[] = [];
  const ram = profile.ramGb;

  if (profile.detectedRuntimes.length === 0) {
    warnings.push("No local AI runtime detected — install one (e.g. Ollama) before a local model can run at all.");
  }

  if (ram === null) {
    return {
      sizeClass: "unknown",
      reasoning: "This browser does not report RAM, so no size recommendation can be made. Free/BYOK cloud providers work regardless of local hardware.",
      warnings,
    };
  }

  // Rough, stated-as-rough headroom rule: a quantized model needs roughly
  // its parameter count in GB (4-bit) to load, plus headroom for the OS and
  // the browser itself. These are class boundaries, not a promise.
  if (ram <= 4) {
    warnings.push("4 GB or less reported — even small local models are likely to struggle. Free cloud providers are a better fit on this device.");
    return { sizeClass: "cloud-recommended", reasoning: "Reported memory is low enough that local inference is unlikely to be practical.", warnings };
  }
  if (ram <= 8) {
    return {
      sizeClass: "3B–4B quantized",
      reasoning: `${ram} GB reported RAM leaves modest headroom after the OS and browser — a 3B–4B class quantized model is the safer fit.`,
      warnings,
    };
  }
  if (ram <= 16) {
    return {
      sizeClass: "7B–8B quantized",
      reasoning: `${ram} GB reported RAM gives a good balance for a 7B–8B class quantized model between capability and headroom.`,
      warnings,
    };
  }
  return {
    sizeClass: "13B+ quantized",
    reasoning: `${ram} GB reported RAM comfortably supports a 13B-class quantized model, or larger depending on available disk.`,
    warnings,
  };
}

interface HardwareProfileRow {
  os: string | null;
  cpu_cores: number | null;
  architecture: string | null;
  ram_gb: number | null;
  gpu_info: string | null;
  vram_gb: number | null;
  storage_free_gb: number | null;
  detected_runtimes: HardwareProfile["detectedRuntimes"];
  detected_models: string[];
  detection_method: "browser-api" | "manual";
  detected_at: string;
}

export async function saveHardwareProfile(profile: HardwareProfile): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const row: HardwareProfileRow & { user_id: string } = {
    user_id: userData.user.id,
    os: profile.os,
    cpu_cores: profile.cpuCores,
    architecture: profile.architecture,
    ram_gb: profile.ramGb,
    gpu_info: profile.gpuInfo,
    vram_gb: profile.vramGb,
    storage_free_gb: profile.storageFreeGb,
    detected_runtimes: profile.detectedRuntimes,
    detected_models: profile.detectedRuntimes.flatMap((r) => r.models),
    detection_method: profile.detectionMethod,
    detected_at: profile.detectedAt,
  };

  await supabase.from("hardware_profiles").upsert(row);
}

export interface ManualHardwareInput {
  os?: string;
  cpuCores?: number;
  architecture?: string;
  ramGb?: number;
  gpuInfo?: string;
  vramGb?: number;
  storageFreeGb?: number;
}

/**
 * Section 16's "manual entry" path — a user who knows their own machine
 * better than a Chrome-capped navigator.deviceMemory can say so directly.
 * Writes to the SAME hardware_profiles row saveHardwareProfile() does (the
 * table is one row per user, not one per detection method): this is a
 * deliberate override action, replacing whatever profile — auto-detected or
 * previously manual — Scholar was using for recommendations, not a second,
 * blended profile. detection_method: "manual" is how a later read tells the
 * two apart; recommendLocalModel() callers should prefer a manually-entered
 * profile when one exists, since the user chose to state it.
 *
 * Every field is optional and a blank one is written as null, never a
 * fallback guess — "Unknown" stays the honest default a UI shows for it,
 * exactly as for an auto-detected field the browser couldn't determine. An
 * all-blank input is a no-op: there is nothing an all-null manual row would
 * say that omitting the write doesn't already say.
 */
export async function saveManualHardwareProfile(input: ManualHardwareInput): Promise<void> {
  const hasAnyField = Object.values(input).some((v) => v !== undefined && v !== "");
  if (!hasAnyField) return;

  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const row: HardwareProfileRow & { user_id: string } = {
    user_id: userData.user.id,
    os: input.os || null,
    cpu_cores: input.cpuCores ?? null,
    architecture: input.architecture || null,
    ram_gb: input.ramGb ?? null,
    gpu_info: input.gpuInfo || null,
    vram_gb: input.vramGb ?? null,
    storage_free_gb: input.storageFreeGb ?? null,
    detected_runtimes: [],
    detected_models: [],
    detection_method: "manual",
    detected_at: new Date().toISOString(),
  };

  await supabase.from("hardware_profiles").upsert(row);
}

export async function loadHardwareProfile(): Promise<HardwareProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase.from("hardware_profiles").select("*").eq("user_id", userData.user.id).maybeSingle();
  if (error || !data) return null;

  const row = data as HardwareProfileRow;
  return {
    os: row.os,
    cpuCores: row.cpu_cores,
    architecture: row.architecture,
    ramGb: row.ram_gb,
    gpuInfo: row.gpu_info,
    vramGb: row.vram_gb,
    storageFreeGb: row.storage_free_gb,
    detectedRuntimes: row.detected_runtimes ?? [],
    detectionMethod: row.detection_method,
    detectedAt: row.detected_at,
  };
}
