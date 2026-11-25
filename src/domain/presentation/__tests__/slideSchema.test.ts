import { describe, expect, it } from 'vitest';
import {
  COPY_LIMITS,
  FALLBACK_ICON,
  SLIDE_LAYOUTS,
  SLIDE_LAYOUT_IDS,
  clampWords,
  copyBudgetIssues,
  layoutPromptGuide,
  resolveIconName,
  slideCardSchema,
  slideItemSchema,
  themeTokensSchema,
  toSlideLayoutId,
} from '../slideSchema';

describe('layout ids', () => {
  it('has one spec per id, with a unique alias', () => {
    expect(SLIDE_LAYOUTS.map((l) => l.id)).toEqual([...SLIDE_LAYOUT_IDS]);
    expect(new Set(SLIDE_LAYOUTS.map((l) => l.alias)).size).toBe(SLIDE_LAYOUTS.length);
  });

  it('accepts ids and descriptive aliases, rejects anything else', () => {
    expect(toSlideLayoutId('grid3')).toBe('grid3');
    expect(toSlideLayoutId('grid-2x2')).toBe('grid4');
    expect(toSlideLayoutId(' Metric-KPI-Row ')).toBe('stats');
    expect(toSlideLayoutId('problem-solution-split')).toBe('problem-solution');
    expect(toSlideLayoutId('hologram')).toBeUndefined();
    expect(toSlideLayoutId(42)).toBeUndefined();
  });

  it('lists every layout in the prompt guide', () => {
    const guide = layoutPromptGuide();
    for (const id of SLIDE_LAYOUT_IDS) expect(guide).toContain(`"${id}"`);
  });
});

describe('icons', () => {
  it('normalises names in any casing and maps common aliases', () => {
    expect(resolveIconName('ShieldCheck')).toBe('shield-check');
    expect(resolveIconName('BarChart3')).toBe('chart-column');
    expect(resolveIconName('graduation_cap')).toBe('graduation-cap');
    expect(resolveIconName('LightbulbIcon')).toBe('lightbulb');
  });

  it('falls back safely for unknown or empty names', () => {
    expect(resolveIconName('unicorn-laser')).toBe(FALLBACK_ICON);
    expect(resolveIconName('')).toBe(FALLBACK_ICON);
    expect(resolveIconName(undefined)).toBe(FALLBACK_ICON);
  });
});

describe('copy limits', () => {
  it('leaves text within 1.5× the budget alone and cuts runaway text', () => {
    const ten = 'one two three four five six seven eight nine ten';
    expect(clampWords(ten, 8)).toBe(ten);
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(clampWords(long, 8).split(' ')).toHaveLength(12);
  });

  it('puts the word budgets into the schema descriptions', () => {
    expect(slideItemSchema.shape.title.description).toContain(`Max ${COPY_LIMITS.itemTitle} words`);
    expect(slideItemSchema.shape.body.description).toContain(`Max ${COPY_LIMITS.itemBody} words`);
    expect(slideCardSchema.shape.headline.description).toContain(`Max ${COPY_LIMITS.headline} words`);
  });

  it('reports fields over budget for a Condense action', () => {
    const issues = copyBudgetIssues({
      headline: 'A headline that is clearly much too long to sit on a single slide card today',
      items: [{ title: 'Short', body: 'fine' }],
    });
    expect(issues.map((i) => i.path)).toEqual(['headline']);
  });
});

describe('card schema', () => {
  it('validates a model card: alias layout, numeric value, icon fallback, bad trend dropped', () => {
    const card = slideCardSchema.parse({
      layout: 'grid-3-column',
      items: [
        { title: 'Faster review', body: 'Editors see structured cards.', icon: 'Rocket' },
        { title: 'Safer layout', icon: 'not-an-icon' },
        { title: '' },
      ],
      stats: [{ value: 42, label: 'percent of sessions', trend: 'sideways' }],
      columns: [{ title: 'Only one', points: ['x'] }],
    });
    expect(card.layout).toBe('grid3');
    expect(card.items.map((i) => i.icon)).toEqual(['rocket', FALLBACK_ICON]);
    expect(card.stats[0]).toEqual({ value: '42', label: 'percent of sessions', detail: undefined, trend: undefined });
    expect(card.columns).toBeUndefined();
  });
});

describe('theme tokens', () => {
  it('normalises hex and never allows pure black', () => {
    const tokens = themeTokensSchema.parse({
      id: 'x',
      name: 'Extracted',
      mode: 'dark',
      colors: { bgPrimary: '#000', bgCard: '1a1a1a', bgAccentMuted: '#222222', textPrimary: '#fafafa', textSecondary: '#a3a3a3', accentPrimary: '#6b9bff', borderSubtle: '#333333' },
      typography: { fontHeading: 'display', fontBody: 'sans', headingWeight: 800 },
      shape: { radiusCard: '12px', shadowStyle: 'soft', cardBorderWidth: 1 },
    });
    expect(tokens.colors.bgPrimary).toBe('#171717');
    expect(tokens.colors.bgCard).toBe('#1A1A1A');
    expect(tokens.typography).toEqual({ fontHeading: 'sans', fontBody: 'sans', headingWeight: 700 });
    expect(tokens.shape.radiusCard).toBe('24px');
  });
});
