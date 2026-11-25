/**
 * Visual planning for Step 02: which graphic each card should use, chosen by
 * the presenter. Nothing is drawn silently: a card only changes when the
 * presenter picks an option, and no figures are ever invented for a visual.
 */
import type { GammaLayout, SlideCard, VisualPlanKind } from '../types/slides';

export const VISUAL_OPTIONS: Array<{ kind: VisualPlanKind; label: string; layout: GammaLayout; hint: string }> = [
  { kind: 'diagram', label: 'Smart Diagram', layout: 'timeline', hint: 'Steps or components as a flow' },
  { kind: 'table', label: 'Comparison Table', layout: 'table', hint: 'Rows compared across two columns' },
  { kind: 'grid', label: 'Multi-Card Grid', layout: 'bento', hint: 'Parallel ideas as tiles' },
  { kind: 'stat', label: 'Key Stat', layout: 'stats', hint: 'One headline figure, only if your text gives it' },
  { kind: 'sources', label: 'Citation List', layout: 'list', hint: 'References as a list' },
  { kind: 'image', label: 'Custom Image', layout: 'split', hint: 'Your own image or graphic' },
];

export const layoutForVisual = (kind: VisualPlanKind): GammaLayout => VISUAL_OPTIONS.find((o) => o.kind === kind)?.layout ?? 'bento';

/** The recommended visual for a card, from its suggested card type and its own words. */
export function recommendVisual(slide: SlideCard, outlineVisualType?: string): VisualPlanKind | null {
  switch (outlineVisualType) {
    case 'Title Hero':
    case 'Key Takeaways':
      return null;
    case 'Process / Timeline':
    case 'Architecture Diagram':
      return 'diagram';
    case '2-Column Comparison':
    case 'Evidence & Metrics':
      return 'table';
    case '3-Card Grid':
      return 'grid';
    default:
      break;
  }
  const hay = `${slide.actionHeadline} ${slide.summary ?? ''}`.toLowerCase();
  const head = slide.actionHeadline.toLowerCase();
  // The slide's own role decides first, so a deck does not get one visual on every card.
  if (/\b(sources?|references?|bibliography|citations?|further reading)\b/.test(head)) return 'sources';
  if (/\b(method|methods|methodology|approach|design|procedure|how we|pipeline|workflow|process)\b/.test(head)) return 'diagram';
  if (/\b(findings?|results?|evidence|data|outcomes?|analysis)\b/.test(head)) return 'table';
  if (/\b(gap|problem|challenge|motivation|why|context|background)\b/.test(head)) return 'stat';
  if (/\b(vs\.?|versus|compar|trade-?off)/.test(hay)) return 'table';
  if (/\b(process|steps?|pipeline|workflow|architecture|stages?|timeline)\b/.test(hay)) return 'diagram';
  return slide.order === 1 ? null : 'grid';
}

/** One line telling the presenter what the recommendation is and why. */
export function describeRecommendation(slide: SlideCard, kind: VisualPlanKind): string {
  const label = VISUAL_OPTIONS.find((o) => o.kind === kind)?.label ?? 'Multi-Card Grid';
  return `Slide ${slide.order}: ${slide.actionHeadline} — recommended: ${label}`;
}
