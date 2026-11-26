import { describe, expect, it } from 'vitest';
import type { CardContent } from '../../types/slides';
import { computeCardGeometry, type RectEl, type TextEl } from '../geometry';
import { measureWidth } from '../measure';
import { resolveDeckTheme } from '../theme';

const theme = resolveDeckTheme('scholar-paper');

describe('eyebrow pill', () => {
  for (const eyebrow of ['Method', 'PSYC 201 · Spring 2026', 'A']) {
    it(`gives "${eyebrow}" room to be set in a wider font without wrapping, and stays inside its pill`, () => {
      const content: CardContent = { eyebrow, headline: 'Sleep and memory', items: [], stats: [] };
      const g = computeCardGeometry(content, 'title', theme, undefined, 'pptx');
      const label = g.elements.find((e): e is TextEl => e.kind === 'text' && e.path === 'eyebrow')!;
      const pill = g.elements.find((e): e is RectEl => e.kind === 'rect' && e.h === 32 && e.radius === 16)!;
      const measured = measureWidth(eyebrow, label.size, theme.bodyFont, 700, label.letterSpacing ?? 0, true);
      // At least 20px of slack beyond the measured text, so a wider substitute font still fits on one line.
      expect(label.w - measured).toBeGreaterThanOrEqual(20);
      // The label box never leaves the pill, and is centred in it.
      expect(label.x).toBeGreaterThanOrEqual(pill.x);
      expect(label.x + label.w).toBeLessThanOrEqual(pill.x + pill.w);
      expect(label.x - pill.x).toBeCloseTo(pill.x + pill.w - (label.x + label.w), 5);
      expect(label.align).toBe('center');
    });
  }
});
