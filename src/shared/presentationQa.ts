/**
 * Audience Q&A: what the server reads from the request. The browser sends the real deck plus the
 * presenter's choices; this turns them into a short digest for the model and clean options.
 * Pure (no AI, no I/O) so the server and tests share it.
 */

export type QaDifficulty = "moderate" | "rigorous" | "adversarial";

export interface QaOptions {
  difficulty: QaDifficulty | null;
  targetSlide: number | null;
  count: number;
}

export interface DeckDigest {
  slideCount: number;
  /** One line per slide: "3. Headline — point; point". */
  text: string;
}

const TEXT_KEYS = new Set(["text", "title", "body", "label", "value", "quote", "content", "caption", "items", "bullets", "points"]);

/** The readable strings inside a slide block or card content, in order, without markup or ids. */
function harvest(value: unknown, out: string[], depth = 0): void {
  if (out.length >= 12 || depth > 4 || value == null) return;
  if (typeof value === "string") {
    const t = value.replace(/\s+/g, " ").trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) harvest(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (TEXT_KEYS.has(k)) harvest(v, out, depth + 1);
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** A compact view of the deck for the model: headline and key points per slide, bounded in size. */
export function deckDigest(deck: unknown, opts: { maxSlides?: number; maxChars?: number } = {}): DeckDigest {
  const maxSlides = opts.maxSlides ?? 15;
  const maxChars = opts.maxChars ?? 3500;
  const slides = Array.isArray((deck as { slides?: unknown } | null)?.slides) ? ((deck as { slides: unknown[] }).slides) : [];
  const lines: string[] = [];
  let used = 0;
  slides.slice(0, maxSlides).forEach((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const headline = typeof s.actionHeadline === "string" && s.actionHeadline.trim() ? s.actionHeadline.trim() : typeof s.title === "string" ? s.title.trim() : "";
    const pieces: string[] = [];
    if (typeof s.summary === "string" && s.summary.trim()) pieces.push(s.summary.trim());
    harvest(s.blocks, pieces);
    harvest(s.content, pieces);
    const points = [...new Set(pieces.filter((p) => p !== headline))].slice(0, 5).map((p) => clip(p, 160));
    const line = `${i + 1}. ${clip(headline || "(untitled)", 140)}${points.length ? ` — ${points.join("; ")}` : ""}`;
    if (used + line.length > maxChars) return;
    lines.push(line);
    used += line.length + 1;
  });
  return { slideCount: slides.length, text: lines.join("\n") };
}

/** The presenter's choices, checked: unknown difficulty or a slide outside the deck is ignored, not guessed. */
export function qaOptions(body: unknown, slideCount: number): QaOptions {
  const b = (body ?? {}) as Record<string, unknown>;
  const difficulty = b.difficulty === "moderate" || b.difficulty === "rigorous" || b.difficulty === "adversarial" ? b.difficulty : null;
  const target = Number(b.targetSlideNumber);
  const targetSlide = Number.isInteger(target) && target >= 1 && target <= Math.max(slideCount, 0) ? target : null;
  const n = Number(b.questionCount);
  const count = Number.isInteger(n) && n >= 1 ? Math.min(6, n) : 3;
  return { difficulty, targetSlide, count };
}
