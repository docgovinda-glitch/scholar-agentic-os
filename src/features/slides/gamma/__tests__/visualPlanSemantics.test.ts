import { describe, expect, it } from 'vitest';
import { recommendVisual } from '../visualPlan';
import type { SlideCard } from '../../types/slides';

const card = (actionHeadline: string, order = 2) => ({ actionHeadline, order }) as SlideCard;

describe('recommendVisual by slide role', () => {
  it('does not give every slide the same visual', () => {
    const kinds = ['The Gap', 'Method', 'Findings', 'Sources'].map((h) => recommendVisual(card(h)));
    expect(kinds).toEqual(['stat', 'diagram', 'table', 'sources']);
  });
});
