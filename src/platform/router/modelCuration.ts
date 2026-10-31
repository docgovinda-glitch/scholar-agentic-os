/**
 * Model curation: turns a provider's live model list into the few models worth
 * showing. Nothing here names a specific model. Model line-ups change monthly,
 * so the provider's own list decides what exists; these rules decide what to show.
 *
 * Rules, in order:
 *   1. Text-generation models only (drop embeddings, audio, image, moderation, realtime).
 *   2. Prefer the stable alias over dated snapshots ("x" over "x-2026-09-30").
 *   3. Drop anything the provider marks deprecated, and previews older than
 *      `previewMaxAgeDays` (default 60).
 *   4. Per family and tier, keep only the newest generation.
 *   5. Badges only where there is evidence (see `assignBadges`).
 *
 * Pure functions only: imported by the browser and the server.
 */

export type ModelTier = "flagship" | "balanced" | "fast";

export interface LiveModel {
  id: string;
  /** Provider-supplied display name, if any. */
  displayName?: string;
  /** Unix ms when the provider created/released it, if reported. */
  createdAt?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  /** Provider-reported lifecycle, if any. */
  deprecated?: boolean;
  preview?: boolean;
  /** Provider-reported capabilities, normalised by the lister. */
  supportsTools?: boolean;
  supportsVision?: boolean;
  /** Provider says this model generates text (e.g. Gemini `generateContent`). */
  generatesText?: boolean;
}

export type BadgeId = "most_capable" | "fastest" | "largest_context" | "best_reasoning" | "best_coding" | "best_value";

export interface Badge {
  id: BadgeId;
  label: string;
  /** Why this badge is shown, in plain words, with the evidence. */
  evidence: string;
}

export interface CuratedModel extends LiveModel {
  provider: string;
  family: string;
  tier: ModelTier;
  /** Parsed generation, e.g. [6, 1] for "...-6.1-...". */
  version: number[];
  badges: Badge[];
}

const NON_TEXT = /(embed|embedding|tts|whisper|transcri|audio|speech|realtime|image|imagen|dall-?e|vision-preview|moderation|search|rerank|guard|ocr|veo|sora|lyria|clip|davinci|babbage|instruct-?0|computer-use)/i;
const DATED_SNAPSHOT = /(-|@)(20\d{2}-?\d{2}-?\d{2}|\d{4}|\d{3,4}-\d{2})$/;
const PREVIEW = /(preview|exp|experimental|beta|alpha|-rc\d*)/i;
const FAST = /(flash|mini|nano|haiku|lite|small|instant|tiny|8b|\bfast\b|turbo|spark)/i;
const FLAGSHIP = /(opus|pro|ultra|large|max|\bplus\b|fable|reasoner|o\d|405b|70b|-xl)/i;

/** Splits "provider-family-6.1-sub" into a family key and a version. */
export function parseModelId(id: string): { family: string; version: number[] } {
  const base = id.replace(/^models\//, "").replace(/:latest$/, "").toLowerCase();
  const m = base.match(/(\d+(?:[.-]\d+){0,2})/);
  const version = m ? m[1].split(/[.-]/).map(Number).filter((n) => Number.isFinite(n) && n < 1000) : [];
  const family = base
    .replace(DATED_SNAPSHOT, "")
    .replace(/(\d+(?:[.-]\d+){0,2})/, "")
    .replace(PREVIEW, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return { family: family || base, version };
}

export function tierOf(id: string): ModelTier {
  if (FAST.test(id)) return "fast";
  if (FLAGSHIP.test(id)) return "flagship";
  return "balanced";
}

const cmpVersion = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
};

export interface CurationOptions {
  now?: number;
  previewMaxAgeDays?: number;
  /** Extra IDs to hide (admin denylist), matched exactly. */
  deny?: ReadonlySet<string>;
  /** Max models kept per provider. */
  maxPerProvider?: number;
}

export function curateModels(provider: string, live: LiveModel[], opts: CurationOptions = {}): CuratedModel[] {
  const now = opts.now ?? Date.now();
  const maxPreviewAge = (opts.previewMaxAgeDays ?? 60) * 86_400_000;
  const ids = new Set(live.map((m) => m.id));

  const eligible = live.filter((m) => {
    if (opts.deny?.has(m.id)) return false;
    if (m.generatesText === false) return false;
    if (NON_TEXT.test(m.id)) return false;
    if (m.deprecated) return false;
    // A dated snapshot is hidden when its alias exists.
    const alias = m.id.replace(DATED_SNAPSHOT, "");
    if (alias !== m.id && ids.has(alias)) return false;
    const isPreview = m.preview ?? PREVIEW.test(m.id);
    if (isPreview && (m.createdAt === undefined || now - m.createdAt > maxPreviewAge)) return false;
    return true;
  });

  // Newest generation per (family, tier); ties broken by release date.
  const best = new Map<string, CuratedModel>();
  for (const m of eligible) {
    const { family, version } = parseModelId(m.id);
    const tier = tierOf(m.id);
    const key = `${family}|${tier}`;
    const cand: CuratedModel = { ...m, provider, family, tier, version, badges: [] };
    const cur = best.get(key);
    if (!cur || cmpVersion(version, cur.version) > 0 || (cmpVersion(version, cur.version) === 0 && (m.createdAt ?? 0) > (cur.createdAt ?? 0))) {
      best.set(key, cand);
    }
  }

  // Within a tier, a family whose newest generation is older than another family's
  // newest generation of the same tier is a superseded line ("gpt-5" vs "gpt-6").
  const byTier = new Map<ModelTier, CuratedModel[]>();
  for (const m of best.values()) byTier.set(m.tier, [...(byTier.get(m.tier) ?? []), m]);
  const kept: CuratedModel[] = [];
  for (const [, models] of byTier) {
    models.sort((a, b) => cmpVersion(b.version, a.version) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const top = models[0];
    const topMajor = top.version[0];
    kept.push(...models.filter((m) => topMajor === undefined || m.version[0] === undefined || m.version[0] >= topMajor).slice(0, 2));
  }

  const order: Record<ModelTier, number> = { flagship: 0, balanced: 1, fast: 2 };
  return kept
    .sort((a, b) => order[a.tier] - order[b.tier] || cmpVersion(b.version, a.version))
    .slice(0, opts.maxPerProvider ?? 4);
}

/** Speeds the router measured for real requests (from `metrics` events). */
export interface MeasuredSpeed {
  modelKey: string; // `${provider}:${id}`
  p50TokensPerSecond: number;
  samples: number;
}

/** A benchmark result an admin pinned, with its source. Without one, no quality badge. */
export interface PinnedBenchmark {
  modelKey: string;
  badge: "best_reasoning" | "best_coding";
  source: string;
  measuredOn: string; // ISO date
}

export function assignBadges(models: CuratedModel[], speeds: MeasuredSpeed[] = [], benchmarks: PinnedBenchmark[] = [], minSamples = 20): CuratedModel[] {
  const key = (m: CuratedModel) => `${m.provider}:${m.id}`;
  const out = models.map((m) => ({ ...m, badges: [] as Badge[] }));

  for (const m of out) {
    if (m.tier === "flagship") m.badges.push({ id: "most_capable", label: "Most capable", evidence: `${m.provider}'s current flagship tier` });
  }

  const measured = speeds.filter((s) => s.samples >= minSamples);
  if (measured.length) {
    const fastest = measured.reduce((a, b) => (b.p50TokensPerSecond > a.p50TokensPerSecond ? b : a));
    const m = out.find((x) => key(x) === fastest.modelKey);
    if (m) m.badges.push({ id: "fastest", label: "Fastest", evidence: `Median ${Math.round(fastest.p50TokensPerSecond)} tokens/s over ${fastest.samples} recent requests` });
  }

  const withContext = out.filter((m) => m.contextWindow);
  if (withContext.length > 1) {
    const largest = withContext.reduce((a, b) => ((b.contextWindow ?? 0) > (a.contextWindow ?? 0) ? b : a));
    largest.badges.push({ id: "largest_context", label: "Largest context", evidence: `${(largest.contextWindow ?? 0).toLocaleString("en")} tokens, as reported by ${largest.provider}` });
  }

  for (const b of benchmarks) {
    const m = out.find((x) => key(x) === b.modelKey);
    if (m) m.badges.push({ id: b.badge, label: b.badge === "best_reasoning" ? "Best reasoning" : "Best coding", evidence: `${b.source} (${b.measuredOn})` });
  }
  return out;
}
