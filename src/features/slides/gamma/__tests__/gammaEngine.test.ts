import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { CardContent, GammaLayout, SlideCard, SlideDeck } from '../../types/slides';
import {
  GAMMA_LAYOUTS,
  editSlideContent,
  getCardContent,
  reflowContent,
  resolveLayout,
  setSlideLayout,
  writeCardContent,
  normalizeDeck,
} from '../content';
import { CANVAS_H, CANVAS_W, computeCardGeometry } from '../geometry';
import { DECK_THEMES, resolveDeckTheme, contrast } from '../theme';
import { composeDeckFromText, composeDeckFromTopic } from '../composer';
import { buildDeckPptx } from '../pptxExport';

const baseSlide = (over: Partial<SlideCard> = {}): SlideCard => ({
  id: 's1',
  order: 1,
  actionHeadline: 'Remote work reshapes housing',
  blocks: [],
  speakerNotes: '',
  framework: 'Standard-Narrative',
  ...over,
});

const rich: CardContent = {
  eyebrow: 'Evidence',
  headline: 'The donut effect in numbers',
  lede: 'Demand moved from city cores to the commuter belt.',
  items: [
    { title: 'Space over proximity', body: 'Households trade commute time for a spare room.' },
    { title: 'Wage arbitrage', body: 'City salaries spent in lower-cost regions.' },
    { title: 'Hybrid anchoring', body: 'Two office days keep buyers within 90 minutes.' },
    { title: 'Supply lag', body: 'Construction trails demand by years.' },
  ],
  stats: [{ value: '60%', label: 'of US home price growth', detail: 'Mondragon & Wieland (2022)' }],
  columns: [
    { title: 'Convert offices', points: ['Adds central supply', 'Costly retrofits'] },
    { title: 'Densify the belt', points: ['Matches demand', 'Needs transit'] },
  ],
  quote: { text: 'Working from home is here to stay.', attribution: 'Nicholas Bloom' },
  takeaway: 'Demand moved, it did not disappear.',
};

describe('content model', () => {
  it('derives card content from legacy blocks', () => {
    const slide = baseSlide({
      blocks: [
        { type: 'action-header', headline: 'Remote work reshapes housing', category: 'Context', subheadline: 'Why it matters' },
        { type: 'bullet-list', items: ['Space over proximity', 'Wage arbitrage'] },
        { type: 'metric-callout', metric: '60%', label: 'of price growth' },
      ],
    });
    const c = getCardContent(slide);
    expect(c.eyebrow).toBe('Context');
    expect(c.lede).toBe('Why it matters');
    expect(c.items.map((i) => i.title)).toEqual(['Space over proximity', 'Wage arbitrage']);
    expect(c.stats[0]).toMatchObject({ value: '60%', label: 'of price growth' });
  });

  it('maps legacy layout ids onto Gamma layouts', () => {
    expect(resolveLayout(baseSlide({ layoutType: 'metric-focus' }), 2)).toBe('stats');
    expect(resolveLayout(baseSlide({ layoutType: 'two-column' }), 2)).toBe('comparison');
    expect(resolveLayout(baseSlide({ layoutType: 'cover' }), 2)).toBe('title');
    expect(resolveLayout(baseSlide(), 0)).toBe('title');
  });

  it('reflows content into a stats layout without inventing figures', () => {
    const noNumbers: CardContent = { headline: 'H', items: [{ title: 'Alpha' }, { title: 'Beta' }], stats: [] };
    const stats = reflowContent(noNumbers, 'stats').stats;
    expect(stats.map((s) => s.value)).toEqual(['01', '02']);
    expect(stats.map((s) => s.label)).toEqual(['Alpha', 'Beta']);
  });

  it('keeps content when switching layouts back and forth', () => {
    let slide = writeCardContent(baseSlide(), rich, 'bento');
    slide = setSlideLayout(slide, 'timeline');
    slide = setSlideLayout(slide, 'comparison');
    slide = setSlideLayout(slide, 'bento');
    expect(getCardContent(slide).items).toHaveLength(4);
    expect(getCardContent(slide).columns?.[0].title).toBe('Convert offices');
  });

  it('applies inline edits by path and drops cleared items', () => {
    let slide = writeCardContent(baseSlide(), rich, 'list');
    slide = editSlideContent(slide, 1, 'items.1.title', 'Salary arbitrage');
    expect(getCardContent(slide).items[1].title).toBe('Salary arbitrage');
    expect(slide.actionHeadline).toBe(rich.headline);
    slide = editSlideContent(slide, 1, 'items.0.title', '');
    slide = editSlideContent(slide, 1, 'items.0.body', '');
    expect(getCardContent(slide).items.map((i) => i.title)).not.toContain('Space over proximity');
  });

  it('detects edits made to legacy blocks by other tools', () => {
    const slide = writeCardContent(baseSlide(), rich, 'list');
    const edited: SlideCard = {
      ...slide,
      blocks: slide.blocks.map((b) => (b.type === 'bullet-list' ? { ...b, items: ['Rewritten by copilot'] } : b)),
    };
    expect(getCardContent(edited).items.map((i) => i.title)).toEqual(['Rewritten by copilot']);
  });

  it('normalises server decks that carry content without legacy blocks', () => {
    const deck = { slides: [baseSlide({ layoutType: 'bento', content: rich })] };
    const out = normalizeDeck(deck);
    expect(out.slides[0].contentFingerprint).toBeTruthy();
    expect(out.slides[0].blocks.some((b) => b.type === 'bullet-list')).toBe(true);
  });
});

describe('themes', () => {
  it('never uses pure black and keeps body text readable', () => {
    for (const t of DECK_THEMES) {
      for (const c of [t.bg, t.surface, t.surfaceAlt, t.text, t.accent]) expect(c.toUpperCase()).not.toBe('#000000');
      expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses the Scholar monochrome palette by default', () => {
    expect(resolveDeckTheme('scholar-paper').bg).toBe('#F8F7F4');
    expect(resolveDeckTheme('scholar-ink').bg).toBe('#171717');
  });

  it('adapts legacy library themes and custom accents', () => {
    const legacy = resolveDeckTheme('oxford-navy');
    expect(legacy.bg).toMatch(/^#[0-9A-F]{6}$/);
    const custom = resolveDeckTheme('scholar-paper', { accentColor: '#2F6B4F', fontPairing: 'Inter', surfaceTreatment: 'elevated', contrastRatio: 5, isValidWcagAA: true });
    expect(custom.accent).toBe('#2F6B4F');
    expect(custom.bg).toBe('#F8F7F4');
  });
});

describe('geometry', () => {
  const layouts = GAMMA_LAYOUTS.map((l) => l.id) as GammaLayout[];

  it.each(layouts)('%s keeps every element on the 16:9 canvas', (layout) => {
    for (const theme of [resolveDeckTheme('scholar-paper'), resolveDeckTheme('graphite-amber')]) {
      const g = computeCardGeometry(rich, layout, theme, 3);
      expect(g.elements.length).toBeGreaterThan(2);
      for (const el of g.elements) {
        if (el.kind === 'line') continue;
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
        expect(el.x + el.w).toBeLessThanOrEqual(CANVAS_W + 0.5);
        expect(el.y + el.h).toBeLessThanOrEqual(CANVAS_H + 0.5);
      }
      expect(g.elements.some((e) => e.kind === 'text' && e.path === 'headline' || e.kind === 'text' && e.path === 'quote.text')).toBe(true);
    }
  });
});

describe('composer', () => {
  const text = `# Remote work and housing
## Background
Mondragon and Wieland (2022) estimate that remote work explains 60% of US house price growth.
## Mechanisms
Households value extra space for a home office. City wages are spent in lower-cost regions. Hybrid schedules keep buyers within commuting distance. Exurban construction lags demand by several years.
## Method
First, we collected listings. Then we measured teleworkable jobs. Finally, we estimated the model.
## Policy options
Converting offices to homes adds central supply. Densifying commuter belts matches where demand moved.`;

  it('builds varied cards from the text and only uses its own figures', () => {
    const deck = composeDeckFromText(text, { slideCount: 8 });
    const layouts = deck.slides.map((s, i) => resolveLayout(s, i));
    expect(layouts).toEqual(['title', 'stats', 'bento', 'timeline', 'comparison']);
    const figures = deck.slides.flatMap((s) => getCardContent(s).stats.map((st) => st.value));
    expect(figures).toEqual(['60%']);
    for (const f of figures) expect(text).toContain(f.replace('−', '-'));
    expect(deck.slides[2].speakerNotes).toContain('Households value extra space');
  });

  it('respects the requested slide count', () => {
    expect(composeDeckFromText(text, { slideCount: 3 }).slides).toHaveLength(3);
  });

  it('scaffolds a topic without inventing any numbers', () => {
    const deck = composeDeckFromTopic('Climate migration in South Asia', { slideCount: 8 });
    expect(deck.slides).toHaveLength(8);
    const all = JSON.stringify(deck.slides.map((s) => getCardContent(s)));
    expect(all).not.toMatch(/\d+(\.\d+)?\s?%/);
    const layouts = new Set(deck.slides.map((s, i) => resolveLayout(s, i)));
    expect(layouts.size).toBeGreaterThanOrEqual(5);
  });
});

describe('pptx export', () => {
  it('writes one native slide per card with speaker notes', async () => {
    const deck: SlideDeck = { ...composeDeckFromTopic('Urban heat islands', { slideCount: 5 }), themeId: 'scholar-ink' };
    const pptx = await buildDeckPptx(deck);
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(5);
    const first = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(first).toContain('Urban Heat Islands');
    expect(first).toContain('171717'); // Ink background, never pure black
    expect(first).not.toContain('"000000"');
    const notes = Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
    expect(notes.length).toBe(5);
  });
});

describe('auto-design', () => {
  it('picks layouts from content regardless of position and never changes text', async () => {
    const { autoDesignDeck, composeDeckFromText } = await import('../composer');
    const deck = composeDeckFromText(
      `# Housing\nRemote work changed housing.\n## Method\nFirst, we collected listings. Then we measured jobs. Finally, we fitted a model.\n## Evidence\nRents fell 10% in cities while suburban rents rose 7%.`,
      { slideCount: 6 },
    );
    // Move the method card to the front, then reset every layout to plain points.
    const shuffled = { ...deck, slides: [deck.slides[1], deck.slides[0], deck.slides[2]].map((s) => ({ ...s, layoutType: 'list' as const })) };
    const before = shuffled.slides.map((s) => JSON.stringify({ ...getCardContent(s) }));
    const out = autoDesignDeck(shuffled);
    expect(out.slides.map((s, i) => resolveLayout(s, i))).toEqual(['timeline', 'statement', 'stats']);
    expect(out.slides.map((s) => JSON.stringify({ ...getCardContent(s) }))).toEqual(before);
  });
});

describe('saved decks from earlier versions', () => {
  // Every user-visible string in the legacy block model must survive into card content.
  const strings = (v: unknown): string[] =>
    typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

  it.each([
    ['curated case-study deck', () => import('../../services/slideGenerator').then((m) => m.generateSlideDeck({ topic: 'Why Zappos pays new hires to quit (MN6094NI)' }))],
    ['swiss editorial deck', () => import('../../services/slideGenerator').then((m) => m.decomposeToSwissEditorial({ topic: 'Plover migration' }))],
    ['coursework extraction deck', () => import('../../services/slideGenerator').then((m) => m.extractSlidesFromAcademicText('# T\n## Context\nTools fail 84% of audits.\n- Risk one\n- Risk two\n## Results\nVerification reaches 100% accuracy.'))],
  ])('%s loads without losing text', async (_name, load) => {
    const legacy = await load();
    expect(legacy.slides.length).toBeGreaterThan(0);
    legacy.slides.forEach((s, i) => {
      const contentText = JSON.stringify(getCardContent(s));
      const blockText = strings(s.blocks).filter((t) => t.length > 2 && !/^(action-header|bullet-list|metric-callout|two-column|quote-evidence|image|split|hero|card|16:9|4:3|up|down|neutral)$/.test(t));
      for (const t of blockText) expect(contentText, `slide ${i + 1}: "${t}"`).toContain(JSON.stringify(t.replace(/\s+/g, ' ').trim()).slice(1, -1));
      // And it renders in its resolved layout.
      expect(computeCardGeometry(getCardContent(s), resolveLayout(s, i), resolveDeckTheme('scholar-paper')).elements.length).toBeGreaterThan(0);
    });
  });
});
