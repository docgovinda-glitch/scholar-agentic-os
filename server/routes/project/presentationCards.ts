/**
 * Gamma-style card payloads for AI-generated presentation decks.
 *
 * The model is asked for structured card content (layout + fields). Its
 * output is validated here with zod, trimmed to what a card can hold, and
 * every figure is checked against the source material: a number the model
 * cannot point to in the user's topic, notes or project data is dropped
 * rather than shown as evidence.
 */
import {
  ITEM_LAYOUTS,
  SLIDE_LAYOUT_IDS,
  slideCardSchema,
  type SlideLayoutId,
  type StatTrend,
} from "../../../src/domain/presentation/slideSchema.ts";

/** Layout ids the model may choose (shared with the client renderer). */
export const GAMMA_LAYOUT_IDS = SLIDE_LAYOUT_IDS;
export type GammaLayoutId = SlideLayoutId;

/** The card schema lives in src/domain/presentation/slideSchema.ts. */
export const gammaCardSchema = slideCardSchema;

/** Card content carried on each generated slide (mirrors CardContent on the client). */
export interface GammaCardPayload {
  layout?: GammaLayoutId;
  eyebrow?: string;
  lede?: string;
  items: Array<{ title: string; body?: string; icon?: string }>;
  stats: Array<{ value: string; label: string; detail?: string; trend?: StatTrend }>;
  columns?: Array<{ title: string; points: string[] }>;
  quote?: { text: string; attribution?: string };
  takeaway?: string;
}

/** True when every number in `value` appears somewhere in `corpus`. */
export function figureIsGrounded(value: string, corpus: string): boolean {
  const nums = value.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!nums) return true; // not a figure (e.g. "Phase I")
  const hay = corpus.replace(/,(?=\d{3})/g, "");
  return nums.every((n) => hay.includes(n.replace(/,/g, "")));
}

/**
 * Validate one AI card. Ungrounded figures are removed; a stats card left
 * without figures falls back to a key-points card built from its labels.
 */
export function parseGammaCard(raw: unknown, sourceCorpus: string): GammaCardPayload | undefined {
  const parsed = gammaCardSchema.safeParse(raw ?? {});
  if (!parsed.success) return undefined;
  const card = parsed.data;
  const grounded = card.stats.filter((s) => figureIsGrounded(s.value, sourceCorpus));
  const dropped = card.stats.filter((s) => !grounded.includes(s));
  let layout = card.layout ?? undefined;
  let items = card.items;
  if (layout === "stats" && grounded.length === 0) {
    layout = items.length >= 4 ? "bento" : "list";
    items = items.length ? items : dropped.map((s) => ({ title: s.label, body: s.detail, icon: undefined }));
  }
  // A layout built from items (or two columns) with nothing to draw falls back to one that can render.
  if (layout && ITEM_LAYOUTS.has(layout) && items.length === 0) {
    layout = card.columns ? "comparison" : "statement";
  }
  if (layout === "problem-solution" && !card.columns && items.length < 2) {
    layout = items.length ? "list" : "statement";
  }
  return {
    layout,
    eyebrow: card.eyebrow,
    lede: card.lede,
    items,
    stats: grounded,
    columns: card.columns ? [card.columns[0], card.columns[1]] : undefined,
    quote: card.quote,
    takeaway: card.takeaway,
  };
}
