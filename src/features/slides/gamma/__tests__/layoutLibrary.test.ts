import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { CardContent, GammaLayout, SlideDeck } from '../../types/slides';
import { GAMMA_LAYOUTS, reflowContent, writeCardContent } from '../content';
import { CANVAS_H, CANVAS_W, computeCardGeometry, type CardElement, type IconEl, type RectEl, type TextEl } from '../geometry';
import { DECK_THEMES, deckThemeCssVars, deckThemeToTokens, resolveDeckTheme, tokensToDeckTheme } from '../theme';
import { iconSvg, slideIcon, SLIDE_ICONS } from '../icons';
import { buildDeckPptx } from '../pptxExport';
import { COPY_LIMITS, FALLBACK_ICON, SLIDE_ICON_NAMES, themeTokensSchema } from '../../../../domain/presentation/slideSchema';

const texts = (els: CardElement[]) => els.filter((e): e is TextEl => e.kind === 'text');
const icons = (els: CardElement[]) => els.filter((e): e is IconEl => e.kind === 'icon');
const rects = (els: CardElement[]) => els.filter((e): e is RectEl => e.kind === 'rect');

const items = [
  { title: 'Define the question', body: 'Scope what the review must answer.', icon: 'target' },
  { title: 'Gather evidence', body: 'Search the databases named in the brief.', icon: 'search' },
  { title: 'Appraise quality', body: 'Score each study with one checklist.', icon: 'shield-check' },
  { title: 'Synthesise', body: 'Group findings by mechanism, not by paper.', icon: 'layers' },
];
const base: CardContent = { eyebrow: 'Method', headline: 'Four steps keep the review honest', lede: 'Each step leaves a record.', items, stats: [] };

const LONG = 'This deliberately long sentence keeps going well past any sensible budget so the engine has to step its type down to fit the card';
const crowded: CardContent = {
  eyebrow: 'Stress test',
  headline: `${LONG} and still the headline continues`,
  lede: LONG,
  items: Array.from({ length: 6 }, (_, i) => ({ title: `${LONG} ${i}`, body: `${LONG} ${LONG}`, icon: 'zap' })),
  stats: [{ value: '42%', label: LONG, detail: LONG, trend: 'up' }, { value: '7', label: 'cases', trend: 'down' }],
  columns: [
    { title: 'Before', points: Array.from({ length: 6 }, () => LONG) },
    { title: 'After', points: Array.from({ length: 6 }, () => LONG) },
  ],
  quote: { text: LONG, attribution: 'Author (2024)' },
  takeaway: LONG,
};

describe('new layouts', () => {
  const theme = resolveDeckTheme('scholar-paper');

  it('grid3 draws three equal cards with their icons', () => {
    const g = computeCardGeometry(base, 'grid3', theme, 2);
    const titles = texts(g.elements).filter((t) => /^items\.\d\.title$/.test(t.path ?? ''));
    expect(titles.map((t) => t.text)).toEqual(items.slice(0, 3).map((i) => i.title));
    expect(icons(g.elements).map((i) => i.name)).toEqual(['target', 'search', 'shield-check']);
    const cards = rects(g.elements).filter((r) => r.fill === theme.surface);
    expect(new Set(cards.map((c) => Math.round(c.w))).size).toBe(1);
  });

  it('grid4 draws a 2 × 2 grid and numbers cards that have no icon', () => {
    const plain = { ...base, items: items.map(({ title, body }) => ({ title, body })) };
    const g = computeCardGeometry(plain, 'grid4', theme, 2);
    expect(texts(g.elements).filter((t) => /^items\.\d\.title$/.test(t.path ?? ''))).toHaveLength(4);
    expect(texts(g.elements).map((t) => t.text)).toEqual(expect.arrayContaining(['01', '02', '03', '04']));
    const ys = new Set(rects(g.elements).filter((r) => r.fill === theme.surface).map((r) => Math.round(r.y)));
    expect(ys.size).toBe(2);
  });

  it('pyramid stacks tiers that widen downwards, apex on the accent', () => {
    const g = computeCardGeometry({ ...base, items: items.slice(0, 3) }, 'pyramid', theme, 2);
    const tiers = rects(g.elements).filter((r) => r.h > 40);
    expect(tiers).toHaveLength(3);
    expect(tiers[0].w).toBeLessThan(tiers[1].w);
    expect(tiers[1].w).toBeLessThan(tiers[2].w);
    expect(tiers[0].fill).toBe(theme.accent);
    expect(texts(g.elements).some((t) => t.path === 'items.2.body')).toBe(true);
  });

  it('problem-solution labels empty headings and marks points with x / check', () => {
    const c = reflowContent({ headline: 'Manual grading does not scale', items: [{ title: 'Slow feedback' }, { title: 'Rubric drift' }, { title: 'Shared rubric' }, { title: 'Fast feedback' }], stats: [] }, 'problem-solution');
    const g = computeCardGeometry(c, 'problem-solution', theme, 2);
    expect(texts(g.elements).map((t) => t.text)).toEqual(expect.arrayContaining(['Problem', 'Solution']));
    const names = icons(g.elements).map((i) => i.name);
    expect(names).toContain('x');
    expect(names).toContain('check');
    expect(names).toContain('arrow-right');
  });

  it('takeaways numbers each action and closes with the takeaway line', () => {
    const g = computeCardGeometry({ ...base, takeaway: 'Record every decision as you make it.' }, 'takeaways', theme, 9);
    expect(texts(g.elements).map((t) => t.text)).toEqual(expect.arrayContaining(['1', '2', '3', '4', 'Record every decision as you make it.']));
  });

  it('title shows the eyebrow as a metadata pill', () => {
    const g = computeCardGeometry(base, 'title', theme);
    const eyebrow = texts(g.elements).find((t) => t.path === 'eyebrow');
    expect(eyebrow).toBeTruthy();
    const pill = rects(g.elements).find((r) => r.y === eyebrow!.y && r.h === 32);
    expect(pill?.radius).toBe(16);
  });

  it('stats show a trend pill only when the source states a direction', () => {
    const withTrend = computeCardGeometry({ ...base, stats: [{ value: '60%', label: 'growth', trend: 'up' }, { value: '10%', label: 'rents' }] }, 'stats', theme, 2);
    expect(icons(withTrend.elements).map((i) => i.name)).toEqual(['trending-up']);
    const without = computeCardGeometry({ ...base, stats: [{ value: '60%', label: 'growth' }, { value: '10%', label: 'rents' }] }, 'stats', theme, 2);
    expect(icons(without.elements)).toHaveLength(0);
  });
});

/** Every field at `k` × its word budget, every layout's maximum units. */
const atBudget = (k: number): CardContent => {
const W = (n: number) => Array.from({ length: Math.ceil(n * k) }, (_, i) => ['analysis', 'of', 'structured', 'evidence', 'shows', 'longer', 'sentences', 'here'][i % 8]).join(' ');
const L = COPY_LIMITS;
return {
  eyebrow: W(L.eyebrow),
  headline: W(L.headline),
  lede: W(L.lede),
  items: Array.from({ length: 6 }, () => ({ title: W(L.itemTitle), body: W(L.itemBody), icon: 'zap' })),
  stats: Array.from({ length: 4 }, () => ({ value: '42.5%', label: W(L.statLabel), detail: W(L.statDetail), trend: 'up' as const })),
  columns: [
    { title: W(L.columnTitle), points: Array.from({ length: 6 }, () => W(L.columnPoint)) },
    { title: W(L.columnTitle), points: Array.from({ length: 6 }, () => W(L.columnPoint)) },
  ],
  quote: { text: W(L.quote), attribution: W(L.attribution) },
  takeaway: W(L.takeaway),
};
};

const onCanvas = (els: CardElement[]) => {
  for (const el of els) {
    if (el.kind === 'line') continue;
    const w = el.kind === 'icon' ? el.size : el.w;
    const h = el.kind === 'icon' ? el.size : el.h;
    expect(el.x).toBeGreaterThanOrEqual(0);
    expect(el.y).toBeGreaterThanOrEqual(0);
    expect(el.x + w).toBeLessThanOrEqual(CANVAS_W + 0.5);
    expect(el.y + h).toBeLessThanOrEqual(CANVAS_H + 0.5);
  }
};

describe('overflow safeguards', () => {
  const layouts = GAMMA_LAYOUTS.map((l) => l.id) as GammaLayout[];

  it.each(layouts)('%s fits copy up to 1.25× the word budgets in every preset without cutting', (layout) => {
    for (const k of [1, 1.25]) {
      for (const theme of DECK_THEMES) {
        const g = computeCardGeometry(atBudget(k), layout, theme, 12);
        expect(g.overflow).toBe(false);
        onCanvas(g.elements);
      }
    }
  });

  it('steps type down instead of overflowing when a card is dense', () => {
    const theme = resolveDeckTheme('scholar-paper');
    const roomy = computeCardGeometry(base, 'split', theme, 2);
    const dense = computeCardGeometry(atBudget(1.25), 'split', theme, 2);
    const size = (g: typeof roomy) => texts(g.elements).find((t) => t.path === 'items.0.title')!.size;
    expect(size(dense)).toBeLessThan(size(roomy));
    expect(dense.overflow).toBe(false);
  });

  it.each(layouts)('%s never breaks the frame with far-over-budget text', (layout) => {
    for (const theme of DECK_THEMES) {
      const g = computeCardGeometry(crowded, layout, theme, 12);
      onCanvas(g.elements);
      expect(g.elements.some((e) => e.kind === 'text' && e.path === 'headline' || e.kind === 'text' && e.path === 'quote.text')).toBe(true);
    }
  });

  it('flags a card that holds more text than its layout can show', () => {
    expect(computeCardGeometry(crowded, 'list', resolveDeckTheme('scholar-paper'), 2).overflow).toBe(true);
    expect(computeCardGeometry(base, 'takeaways', resolveDeckTheme('scholar-paper'), 2).overflow).toBe(false);
  });
});

describe('theme shape tokens', () => {
  it('ships the six named presets', () => {
    const ids = DECK_THEMES.map((t) => t.id);
    for (const id of ['obsidian-minimal', 'cupertino-daylight', 'terracotta-editorial', 'swiss-mono', 'emerald-executive', 'midnight-cobalt']) {
      expect(ids).toContain(id);
    }
    const obsidian = resolveDeckTheme('obsidian-minimal');
    expect([obsidian.bg, obsidian.surface]).toEqual(['#171717', '#222222']);
  });

  it('applies radius, border and shadow tokens to cards', () => {
    const swiss = computeCardGeometry(base, 'grid3', resolveDeckTheme('swiss-mono'), 2);
    expect(rects(swiss.elements).filter((r) => r.w > 200).every((r) => r.radius === 0)).toBe(true);

    const daylight = resolveDeckTheme('cupertino-daylight');
    const day = computeCardGeometry(base, 'grid3', daylight, 2);
    const cards = rects(day.elements).filter((r) => r.fill === daylight.surface);
    expect(cards.every((c) => c.stroke === undefined && c.shadow === 'soft')).toBe(true);

    const paper = computeCardGeometry(base, 'grid3', resolveDeckTheme('scholar-paper'), 2);
    expect(rects(paper.elements).some((r) => r.radius === 24)).toBe(true);
    expect(rects(paper.elements).some((r) => r.shadow)).toBe(false);
  });

  it('exposes the theme as scoped --slide-* variables', () => {
    const vars = deckThemeCssVars(resolveDeckTheme('obsidian-minimal'));
    expect(vars['--slide-bg']).toBe('#171717');
    expect(vars['--slide-card']).toBe('#222222');
    expect(vars['--slide-radius']).toBe('16px');
    expect(vars['--slide-font-heading']).toContain('Plus Jakarta Sans');
  });

  it('round-trips presets through portable ThemeTokens', () => {
    for (const theme of DECK_THEMES) {
      const tokens = themeTokensSchema.parse(deckThemeToTokens(theme));
      const back = tokensToDeckTheme(tokens, theme.description);
      expect(back.bg).toBe(theme.bg);
      expect(back.accent).toBe(theme.accent);
      expect(back.text).toBe(theme.text);
    }
  });

  it('repairs unreadable extracted text colours', () => {
    const theme = tokensToDeckTheme(
      themeTokensSchema.parse({
        id: 'shot', name: 'Screenshot', mode: 'light',
        colors: { bgPrimary: '#ffffff', bgCard: '#ffffff', bgAccentMuted: '#f4f4f4', textPrimary: '#eeeeee', textSecondary: '#f0f0f0', accentPrimary: '#0066cc', borderSubtle: '#e5e5e5' },
        typography: { fontHeading: 'serif', fontBody: 'sans', headingWeight: 600 },
        shape: { radiusCard: '8px', shadowStyle: 'none', cardBorderWidth: 1 },
      }),
    );
    expect(theme.text).toBe('#171717');
    expect(theme.radius).toBe(8);
  });
});

describe('icons', () => {
  it('maps every allowlisted name to a component, with a fallback', () => {
    expect(Object.keys(SLIDE_ICONS).sort()).toEqual([...SLIDE_ICON_NAMES].sort());
    expect(slideIcon('no-such-icon')).toBe(SLIDE_ICONS[FALLBACK_ICON]);
  });

  it('serialises the same glyph to SVG for PowerPoint', () => {
    const svg = iconSvg('check', '#0066CC', 2.5);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('stroke="#0066CC"');
    expect(svg).toMatch(/<path d="[^"]+"\/>/);
    expect(svg).not.toContain('key=');
  });
});

describe('.pptx export of the new layouts', () => {
  it('draws icons as images and keeps every slide', async () => {
    const layouts: GammaLayout[] = ['title', 'grid3', 'grid4', 'pyramid', 'problem-solution', 'takeaways'];
    const slides = layouts.map((layout, i) =>
      writeCardContent({ id: `s${i}`, order: i + 1, actionHeadline: base.headline, blocks: [], speakerNotes: '', framework: 'Standard-Narrative' }, base, layout),
    );
    const deck = { id: 'd', title: 'Layouts', themeId: 'cupertino-daylight', slides } as unknown as SlideDeck;
    const pptx = await buildDeckPptx(deck);
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(layouts.length);
    const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
    expect(media.length).toBeGreaterThan(0);
    const grid = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(grid).toContain('Define the question');
    expect(grid).toContain('outerShdw');
  });
});
