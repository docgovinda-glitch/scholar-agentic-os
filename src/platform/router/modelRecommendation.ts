/**
 * "Which model should I use?" for a freshly connected provider. The answer comes
 * only from the provider's own live model list: no model name appears in this
 * file, so a retired or renamed model can never be recommended.
 *
 * Roles (each with the evidence it rests on):
 *   recommended   newest balanced-tier model (best default for long, grounded writing),
 *                 falling back to the newest flagship, then fast, tier
 *   most_capable  newest flagship-tier model
 *   fastest       newest fast-tier model
 *
 * Aggregators (OpenRouter, Together, Hugging Face, Vercel, ...) list hundreds of
 * models from many vendors, so they are curated per vendor first and then ranked
 * by release date.
 *
 * Pure: imported by the browser and the server.
 */
import { assignBadges, curateModels, type CuratedModel, type LiveModel, type ModelTier } from "./modelCuration";

export type ModelRole = "recommended" | "most_capable" | "fastest" | "option";

export interface ModelOption extends CuratedModel {
  role: ModelRole;
  /** One plain sentence saying why this model is shown. */
  why: string;
}

export interface Recommendation {
  recommended: ModelOption | null;
  /** Recommended first, then the other good options (at most five in all). */
  options: ModelOption[];
  /** Models the provider listed that are usable text models, before curation. */
  totalListed: number;
}

const MIN_CONTEXT = 16_000;
const TIER_PREFERENCE: ModelTier[] = ["balanced", "flagship", "fast"];

const newest = (a: CuratedModel, b: CuratedModel) =>
  (b.createdAt ?? 0) - (a.createdAt ?? 0) || cmp(b.version, a.version);
function cmp(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

const isAggregator = (live: LiveModel[]) => live.length > 30 && live.filter((m) => m.id.includes("/")).length / live.length >= 0.5;

function curate(provider: string, live: LiveModel[], now?: number): CuratedModel[] {
  if (!isAggregator(live)) return curateModels(provider, live, { now, maxPerProvider: 6 });
  const byVendor = new Map<string, LiveModel[]>();
  for (const m of live) {
    const vendor = m.id.split("/")[0].toLowerCase();
    byVendor.set(vendor, [...(byVendor.get(vendor) ?? []), m]);
  }
  const picks: CuratedModel[] = [];
  for (const models of byVendor.values()) picks.push(...curateModels(provider, models, { now, maxPerProvider: 2 }));
  return picks.sort(newest).slice(0, 12);
}

export function recommendModels(provider: string, live: LiveModel[], opts: { now?: number; exclude?: ReadonlySet<string> } = {}): Recommendation {
  // Too-small models are dropped before curation, or they could displace a usable model of the same tier.
  const usable = live.filter((m) => !opts.exclude?.has(m.id) && (m.contextWindow === undefined || m.contextWindow >= MIN_CONTEXT));
  const pool = assignBadges(curate(provider, usable, opts.now));
  if (!pool.length) return { recommended: null, options: [], totalListed: live.length };

  const bestOf = (tier: ModelTier) => pool.filter((m) => m.tier === tier).sort(newest)[0];
  const rec = TIER_PREFERENCE.map(bestOf).find(Boolean)!;
  const flagship = bestOf("flagship");
  const fast = bestOf("fast");

  const tierWord = (t: ModelTier) => (t === "balanced" ? "balanced" : t === "flagship" ? "most capable" : "fastest");
  const make = (m: CuratedModel, role: ModelRole, why: string): ModelOption => ({ ...m, role, why });
  const options: ModelOption[] = [make(rec, "recommended", `The newest ${tierWord(rec.tier)}-tier model your account lists. A good default for long, source-grounded writing.`)];
  if (flagship && flagship.id !== rec.id) options.push(make(flagship, "most_capable", "The newest flagship-tier model your account lists: strongest reasoning, usually slower."));
  if (fast && fast.id !== rec.id && fast.id !== flagship?.id) options.push(make(fast, "fastest", "The newest fast-tier model your account lists: quickest answers, lighter reasoning."));
  for (const m of [...pool].sort(newest)) {
    if (options.length >= 5) break;
    if (!options.some((o) => o.id === m.id)) options.push(make(m, "option", `Listed by your provider (${tierWord(m.tier)} tier).`));
  }
  return { recommended: options[0], options, totalListed: live.length };
}
