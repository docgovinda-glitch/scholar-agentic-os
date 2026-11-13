/**
 * Typed blocks for "+ Add Card / Block" in the studio. Each block says what
 * it is for, carries placeholder guidance (never invented facts or numbers),
 * and may be filled by "Write with AI".
 */
import type { CardContent, GammaLayout } from '../types/slides';
import { SLIDE_LAYOUTS } from '../../../domain/presentation/slideSchema';

export type BlockKind = 'insight' | 'column' | 'diagram' | 'evidence' | 'media' | 'metric';

export interface BlockSpec {
  kind: BlockKind;
  label: string;
  /** What to write here. */
  guidance: string;
  /** Name sent to the AI. */
  aiName: string;
}

export const BLOCK_SPECS: readonly BlockSpec[] = [
  { kind: 'insight', label: 'Key Insight Card', guidance: 'One finding in 15-30 words: the point, then why it matters.', aiName: 'Key Insight Card' },
  { kind: 'column', label: 'Comparison Column', guidance: 'One point for one side of the comparison.', aiName: 'Comparison Column point' },
  { kind: 'diagram', label: 'Diagram / Flowchart Block', guidance: 'One step or component of the flow, with what it hands to the next.', aiName: 'Diagram step' },
  { kind: 'evidence', label: 'Evidence Callout', guidance: 'The evidence and its source, in one sentence.', aiName: 'Evidence Callout' },
  { kind: 'media', label: 'Image / Media Slot', guidance: 'Choose an image or graphic from your device.', aiName: 'Image caption' },
  { kind: 'metric', label: 'Metric Card', guidance: 'A figure from a cited source, with what it measures.', aiName: 'Metric Card' },
] as const;

export interface BlockFill {
  title?: string;
  body?: string;
}

const LIMITS = { items: 6, timeline: 5, stats: 4, column: 6 };

export interface AddBlockResult {
  content: CardContent;
  layout: GammaLayout;
  /** True when the block needs the image picker next. */
  needsImage?: boolean;
  /** False when the card is already full. */
  added: boolean;
}

export function addBlock(content: CardContent, layout: GammaLayout, kind: BlockKind, fill: BlockFill = {}): AddBlockResult {
  const spec = BLOCK_SPECS.find((b) => b.kind === kind) as BlockSpec;
  const next: CardContent = { ...content, items: [...content.items], stats: [...content.stats] };

  switch (kind) {
    case 'insight': {
      const target: GammaLayout = layout === 'bento' || layout === 'list' || layout === 'split' ? layout : 'bento';
      if (next.items.length >= LIMITS.items) return { content, layout, added: false };
      next.items.push({ title: fill.title || 'Key insight', body: fill.body || spec.guidance });
      return { content: next, layout: target, added: true };
    }
    case 'column': {
      const target: GammaLayout = layout === 'table' ? 'table' : 'comparison';
      const cols = next.columns ? [{ ...next.columns[0], points: [...next.columns[0].points] }, { ...next.columns[1], points: [...next.columns[1].points] }] : [{ title: '', points: [] as string[] }, { title: '', points: [] as string[] }];
      const side = cols[0].points.length <= cols[1].points.length ? 0 : 1;
      if (cols[side].points.length >= LIMITS.column) return { content, layout, added: false };
      cols[side].points.push(fill.body || fill.title || spec.guidance);
      next.columns = [cols[0], cols[1]];
      return { content: next, layout: target, added: true };
    }
    case 'diagram': {
      if (layout === 'timeline' && next.items.length >= LIMITS.timeline) return { content, layout, added: false };
      next.items.push({ title: fill.title || 'Next step', body: fill.body || spec.guidance });
      return { content: next, layout: 'timeline', added: true };
    }
    case 'evidence': {
      next.takeaway = [fill.title, fill.body].filter(Boolean).join(': ') || spec.guidance;
      return { content: next, layout, added: true };
    }
    case 'media': {
      return { content: next, layout: layout === 'title' ? 'title' : 'split', needsImage: true, added: true };
    }
    case 'metric': {
      if (layout === 'stats' && next.stats.length >= LIMITS.stats) return { content, layout, added: false };
      // Never a made-up number: the value stays a dash until the presenter adds a sourced figure.
      next.stats.push({ value: '—', label: fill.title || 'Metric', detail: fill.body || spec.guidance });
      return { content: next, layout: 'stats', added: true };
    }
  }
}

/** Every layout, offered above the active slide (order and labels from the shared schema). */
export const LAYOUT_SWITCHER: Array<{ id: GammaLayout; label: string }> = SLIDE_LAYOUTS.map(({ id, label }) => ({ id, label }));

/** All visible text of a card, as context for the AI. */
export function contentContext(c: CardContent): string {
  return [
    c.headline,
    c.lede,
    ...c.items.map((i) => `${i.title}${i.body ? `: ${i.body}` : ''}`),
    ...c.stats.map((s) => `${s.value} ${s.label}`),
    ...(c.columns ?? []).flatMap((col) => [col.title, ...col.points]),
    c.takeaway,
  ]
    .filter(Boolean)
    .join('\n');
}
