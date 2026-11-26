import { describe, expect, it } from 'vitest';
import type { CardContent, GammaLayout } from '../../types/slides';
import { GAMMA_LAYOUTS, reflowContent, setContentPath } from '../content';
import { computeCardGeometry } from '../geometry';
import { resolveDeckTheme } from '../theme';

const theme = resolveDeckTheme('scholar-paper');
const base = { headline: 'Two ways to grade', items: [{ title: 'Manual' }, { title: 'Rubric', body: 'shared' }], stats: [] } as CardContent;
const asContent = (columns: unknown): CardContent => ({ ...base, columns: columns as CardContent['columns'] });

describe('columns that are not a clean pair never break a slide', () => {
  const malformed: Array<[string, unknown]> = [
    ['an empty list', []],
    ['one column', [{ title: 'Only', points: ['x'] }]],
    ['a hole in front', [null, { title: 'Right', points: ['y'] }]],
    ['a column with no points list', [{ title: 'L' }, { title: 'R' }]],
    ['non-text points', [{ title: 'L', points: [null, 3, 'ok'] }, { title: 'R', points: [] }]],
  ];

  it.each(malformed)('lays out every layout with %s, inside the frame', (_name, columns) => {
    for (const { id } of GAMMA_LAYOUTS) {
      for (const target of ['web', 'pptx'] as const) {
        const g = computeCardGeometry(asContent(columns), id as GammaLayout, theme, 2, target);
        for (const el of g.elements) {
          if (el.kind === 'line') continue;
          const w = el.kind === 'icon' ? el.size : el.w;
          const h = el.kind === 'icon' ? el.size : el.h;
          expect(Number.isFinite(el.x + el.y + w + h)).toBe(true);
          expect(el.x + w).toBeLessThanOrEqual(1281);
          expect(el.y + h).toBeLessThanOrEqual(721);
        }
      }
    }
  });

  it('derives the two columns from the items when the stored ones are unusable', () => {
    const out = reflowContent(asContent([{ title: 'Only', points: [] }]), 'comparison');
    expect(out.columns).toHaveLength(2);
    expect(out.columns!.flatMap((c) => c.points).join(' ')).toContain('Manual');
  });

  it('keeps a good pair as written, and drops non-text points', () => {
    const out = reflowContent(asContent([{ title: 'L', points: ['a', null, 'b'] }, { title: 'R', points: ['c'] }]), 'comparison');
    expect(out.columns).toEqual([{ title: 'L', points: ['a', 'b'] }, { title: 'R', points: ['c'] }]);
  });

  it('survives a path edit on a card that has no columns yet', () => {
    const edited = setContentPath(base, 'columns.1.title', 'Edited');
    expect(() => computeCardGeometry(edited, 'comparison', theme, 1)).not.toThrow();
    expect(() => computeCardGeometry(edited, 'list', theme, 1)).not.toThrow();
  });
});
