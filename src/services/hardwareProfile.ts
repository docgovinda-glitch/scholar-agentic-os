/**
 * Browser-side hardware detection for Local AI recommendations.
 *
 * WHAT A BROWSER CAN HONESTLY DETECT — read this before extending anything
 * here, because the temptation to over-claim is the main risk in this file:
 *
 *  - CPU logical cores: `navigator.hardwareConcurrency`. Reliable and widely
 *    supported. Note it is LOGICAL cores (threads), not physical cores.
 *  - System RAM: `navigator.deviceMemory`. Chromium-only, and deliberately
 *    coarse for fingerprinting reasons — it is rounded to one of 0.25/0.5/1/
 *    2/4/8 and **capped at 8**. A 64 GB workstation reports exactly the same
 *    "8" as a 8 GB laptop. This is the single most important limitation in
 *    this module: we can establish a LOWER BOUND, never the true figure.
 *  - VRAM: there is no API for this at all. WebGPU exposes buffer-size limits
 *    which correlate loosely with GPU class, and WebGL can expose a renderer
 *    NAME, but neither reports actual video memory.
 *  - CPU architecture: `navigator.userAgentData.getHighEntropyValues()` on
 *    Chromium; otherwise inferred from the GPU renderer string. Note macOS
 *    Safari reports "Intel Mac OS X" in its user-agent even on Apple Silicon,
 *    so the user-agent alone must never be trusted for architecture.
 *
 * Because of all this the design is deliberately: detect what we can, state
 * the confidence plainly, and let the user correct it. A confirmed user value
 * always wins over a detected one. We never silently present a guess as fact,
 * and we never recommend a model on the strength of a capped RAM reading.
 */

export type CpuArchitecture = "apple-silicon" | "x86-64" | "arm64" | "unknown";
export type DetectionConfidence = "measured" | "lower-bound" | "estimated" | "unknown";

export interface HardwareProfile {
  /** Logical cores (threads) */
  cpuCores: number | null;
  cpuCoresConfidence: DetectionConfidence;

  architecture: CpuArchitecture;
  architectureConfidence: DetectionConfidence;

  /** Total system RAM in GB */
  ramGb: number | null;
  ramConfidence: DetectionConfidence;

  /** Dedicated video memory in GB — effectively never auto-detectable */
  vramGb: number | null;
  vramConfidence: DetectionConfidence;

  /** Human-readable GPU name when the browser will reveal it */
  gpuName: string | null;
  hasWebGpu: boolean;
  /** Apple Silicon shares one memory pool between CPU and GPU */
  unifiedMemory: boolean;

  platform: "macos" | "windows" | "linux" | "ios" | "android" | "unknown";
  /** True when the values came from the user rather than detection */
  userConfirmed: boolean;
  detectedAt: string;
}

export type HardwareTier = "insufficient" | "entry" | "capable" | "strong" | "workstation";

export interface TierAssessment {
  tier: HardwareTier;
  label: string;
  summary: string;
  /** The largest parameter count worth attempting, in billions */
  maxModelParamsB: number;
  /** Honest warnings — capped RAM readings, missing VRAM data, etc. */
  caveats: string[];
}

const STORAGE_KEY = "scholar_hardware_profile_v1";

// ─────────────────────────────────────────────────────────
// DETECTION
// ─────────────────────────────────────────────────────────

function detectPlatform(): HardwareProfile["platform"] {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

/**
 * Reads the GPU name via WebGL's debug-renderer extension.
 *
 * Browsers increasingly restrict this for fingerprinting reasons (Safari
 * returns a generic string, Firefox gates it behind a preference), so a null
 * here means "the browser wouldn't say", not "no GPU".
 */
function detectGpuName(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === "string" && renderer.trim() ? renderer.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Architecture detection.
 *
 * The GPU renderer string is checked BEFORE the user-agent on purpose: macOS
 * Safari reports "Intel Mac OS X" in its UA even on M-series hardware, so
 * trusting the UA would misclassify every Apple Silicon Mac as x86 — and
 * Apple Silicon is precisely the case where the recommendations differ most
 * (unified memory means the GPU can use most of system RAM).
 */
async function detectArchitecture(
  gpuName: string | null,
  platform: HardwareProfile["platform"]
): Promise<{ architecture: CpuArchitecture; confidence: DetectionConfidence }> {
  if (gpuName && /Apple\s+M\d/i.test(gpuName)) {
    return { architecture: "apple-silicon", confidence: "measured" };
  }

  const uaData = (navigator as unknown as {
    userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> };
  }).userAgentData;

  if (uaData?.getHighEntropyValues) {
    try {
      const values = await uaData.getHighEntropyValues(["architecture"]);
      if (values.architecture === "arm") {
        return {
          architecture: platform === "macos" ? "apple-silicon" : "arm64",
          confidence: "measured",
        };
      }
      if (values.architecture === "x86") {
        return { architecture: "x86-64", confidence: "measured" };
      }
    } catch {
      /* Falls through to the heuristics below. */
    }
  }

  if (platform === "ios" || platform === "android") {
    return { architecture: "arm64", confidence: "estimated" };
  }
  if (gpuName && /(NVIDIA|AMD|Radeon|Intel|GeForce|Arc)/i.test(gpuName)) {
    return { architecture: "x86-64", confidence: "estimated" };
  }
  return { architecture: "unknown", confidence: "unknown" };
}

async function detectWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/**
 * Detect what this browser is willing to reveal. Never throws — every probe
 * degrades to null so a restrictive browser yields a usable "unknown" profile
 * rather than an error.
 */
export async function detectHardware(): Promise<HardwareProfile> {
  const platform = detectPlatform();
  const gpuName = detectGpuName();
  const [{ architecture, confidence: architectureConfidence }, hasWebGpu] = await Promise.all([
    detectArchitecture(gpuName, platform),
    detectWebGpu(),
  ]);

  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  const rawRam = (navigator as unknown as { deviceMemory?: number }).deviceMemory;

  // deviceMemory saturates at 8, so an 8 tells us "at least 8 GB" and nothing
  // more. Anything below 8 is a genuine (if coarsely rounded) reading.
  const ramConfidence: DetectionConfidence =
    rawRam === undefined ? "unknown" : rawRam >= 8 ? "lower-bound" : "estimated";

  const unifiedMemory = architecture === "apple-silicon";

  return {
    cpuCores: typeof cores === "number" && cores > 0 ? cores : null,
    cpuCoresConfidence: typeof cores === "number" && cores > 0 ? "measured" : "unknown",
    architecture,
    architectureConfidence,
    ramGb: typeof rawRam === "number" ? rawRam : null,
    ramConfidence,
    // No browser API reports video memory. Left null so the UI asks rather
    // than inventing a figure that would drive a bad recommendation.
    vramGb: null,
    vramConfidence: "unknown",
    gpuName,
    hasWebGpu,
    unifiedMemory,
    platform,
    userConfirmed: false,
    detectedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────

/** Stored separately from the project blob so it survives project switches —
 *  hardware belongs to the device, not to a piece of writing. */
export function saveHardwareProfile(profile: HardwareProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* Private browsing / quota — the profile is re-detectable, so losing it is harmless. */
  }
}

export function loadHardwareProfile(): HardwareProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HardwareProfile) : null;
  } catch {
    return null;
  }
}

export function clearHardwareProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Apply user corrections. Anything the user states is treated as measured
 *  truth — they can read their own system information, the browser can't. */
export function applyUserOverrides(
  profile: HardwareProfile,
  overrides: { ramGb?: number | null; vramGb?: number | null; cpuCores?: number | null; architecture?: CpuArchitecture }
): HardwareProfile {
  const next: HardwareProfile = { ...profile, userConfirmed: true };

  if (overrides.ramGb != null && overrides.ramGb > 0) {
    next.ramGb = overrides.ramGb;
    next.ramConfidence = "measured";
  }
  if (overrides.vramGb != null && overrides.vramGb >= 0) {
    next.vramGb = overrides.vramGb;
    next.vramConfidence = "measured";
  }
  if (overrides.cpuCores != null && overrides.cpuCores > 0) {
    next.cpuCores = overrides.cpuCores;
    next.cpuCoresConfidence = "measured";
  }
  if (overrides.architecture) {
    next.architecture = overrides.architecture;
    next.architectureConfidence = "measured";
    next.unifiedMemory = overrides.architecture === "apple-silicon";
  }
  return next;
}

// ─────────────────────────────────────────────────────────
// ASSESSMENT
// ─────────────────────────────────────────────────────────

/**
 * How much memory a model can actually use.
 *
 * On Apple Silicon the GPU draws from the same pool as the CPU, and macOS
 * will let roughly 65-75% of total RAM be used for GPU work — so unified
 * memory machines are assessed on system RAM. On a discrete-GPU machine the
 * model runs fastest entirely inside VRAM, but can still run (slowly) from
 * system RAM, so we take whichever is larger and note the tradeoff.
 */
export function usableModelMemoryGb(profile: HardwareProfile): number | null {
  const { ramGb, vramGb, unifiedMemory } = profile;

  if (unifiedMemory && ramGb) return Math.floor(ramGb * 0.7);
  if (vramGb && vramGb > 0) return Math.max(vramGb, ramGb ? Math.floor(ramGb * 0.6) : 0);
  if (ramGb) return Math.floor(ramGb * 0.6);
  return null;
}

export function assessHardware(profile: HardwareProfile): TierAssessment {
  const caveats: string[] = [];
  const usable = usableModelMemoryGb(profile);

  if (profile.ramConfidence === "lower-bound") {
    caveats.push(
      "Your browser reports memory capped at 8 GB for privacy, so this is a minimum — if you have more, enter the real figure for better recommendations."
    );
  }
  if (profile.ramConfidence === "unknown") {
    caveats.push("This browser does not report system memory at all. Please enter it manually.");
  }
  if (profile.vramConfidence === "unknown" && !profile.unifiedMemory) {
    caveats.push(
      "No browser can read graphics memory. If you have a dedicated graphics card, entering its memory will unlock larger models."
    );
  }
  if (profile.platform === "ios" || profile.platform === "android") {
    caveats.push("Phones and tablets cannot run these desktop AI programs — use a cloud provider instead.");
  }

  if (profile.platform === "ios" || profile.platform === "android") {
    return {
      tier: "insufficient",
      label: "Not suitable for local AI",
      summary: "This device cannot run local AI programs. Cloud providers are the right choice here.",
      maxModelParamsB: 0,
      caveats,
    };
  }

  if (usable === null) {
    return {
      tier: "entry",
      label: "Unknown — please confirm your specifications",
      summary: "Not enough information to recommend a model yet. Enter your memory below and this will update.",
      maxModelParamsB: 3,
      caveats,
    };
  }

  if (usable < 4) {
    return {
      tier: "insufficient",
      label: "Below the practical minimum",
      summary: "There is not enough usable memory to run a useful model. A cloud provider will work far better.",
      maxModelParamsB: 1,
      caveats,
    };
  }
  if (usable < 8) {
    return {
      tier: "entry",
      label: "Entry level",
      summary: "Small models will run. Expect short, simple tasks rather than full section drafting.",
      maxModelParamsB: 8,
      caveats,
    };
  }
  if (usable < 16) {
    return {
      tier: "capable",
      label: "Capable",
      summary: "Mid-sized models run comfortably — good enough for real drafting and summarising work.",
      maxModelParamsB: 14,
      caveats,
    };
  }
  if (usable < 32) {
    return {
      tier: "strong",
      label: "Strong",
      summary: "Large models run well. Quality here approaches the mid-tier cloud providers.",
      maxModelParamsB: 32,
      caveats,
    };
  }
  return {
    tier: "workstation",
    label: "Workstation class",
    summary: "This machine can run the largest open models available for local use.",
    maxModelParamsB: 70,
    caveats,
  };
}
