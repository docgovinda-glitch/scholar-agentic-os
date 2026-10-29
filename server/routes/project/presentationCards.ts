/**
 * Gamma-style card payloads for AI-generated presentation decks.
 *
 * The model is asked for structured card content (layout + fields). Its
 * output is validated here with zod, trimmed to what a card can hold, and
 * every figure is checked against the source material: a number the model
 * cannot point to in the user's topic, notes or project data is dropped
 * rather than shown as evidence.
 */
import { z } from "zod";

export const GAMMA_LAYOUT_IDS = ["title", "bento", "stats", "timeline", "comparison", "list", "quote", "split", "statement"] as const;
export type GammaLayoutId = (typeof GAMMA_LAYOUT_IDS)[number];

const text = (max: number) => z.string().trim().max(max * 4).transform((s) => s.replace(/\s+/g, " ").slice(0, max));
const optionalText = (max: number) => text(max).nullish().transform((v) => (v ? v : undefined));

export const gammaCardSchema = z.object({
  layout: z.enum(GAMMA_LAYOUT_IDS).nullish().catch(undefined),
  eyebrow: optionalText(60),
  lede: optionalText(260),
  items: z
    .array(z.object({ title: text(140), body: optionalText(260) }))
    .nullish()
    .transform((v) => (v ?? []).filter((i) => i.title).slice(0, 6)),
  stats: z
    .array(z.object({ value: text(18), label: text(90), detail: optionalText(220) }))
    .nullish()
    .transform((v) => (v ?? []).filter((s) => s.value && s.label).slice(0, 4)),
  columns: z
    .array(z.object({ title: text(80), points: z.array(text(160)).max(8).transform((p) => p.filter(Boolean).slice(0, 6)) }))
    .nullish()
    .transform((v) => (v && v.length >= 2 ? [v[0], v[1]] : undefined)),
  quote: z
    .object({ text: text(320), attribution: optionalText(120) })
    .nullish()
    .transform((v) => (v && v.text ? v : undefined)),
  takeaway: optionalText(160),
});

/** Card content carried on each generated slide (mirrors CardContent on the client). */
export interface GammaCardPayload {
  layout?: GammaLayoutId;
  eyebrow?: string;
  lede?: string;
  items: Array<{ title: string; body?: string }>;
  stats: Array<{ value: string; label: string; detail?: string }>;
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
    items = items.length ? items : dropped.map((s) => ({ title: s.label, body: s.detail }));
  }
  return {
    layout,
    eyebrow: card.eyebrow,
    lede: card.lede,
    items,
    stats: grounded,
    columns: card.columns,
    quote: card.quote,
    takeaway: card.takeaway,
  };
}
