import { describe, it, expect } from 'vitest';
import { CANVA_GAMMA_5_BEATS, applyDeckTheme, is5SlideProgression } from '../deckProgressionService';
import type { SlideDeck } from '../../types/slides';

describe('deckProgressionService', () => {
  const userDeck: SlideDeck = {
    id: 'test-deck',
    title: 'Rural Clinic Wait Times',
    topic: 'Rural Clinic Wait Times',
    sourceModule: 'presentation-studio',
    themeId: 'sand-academic',
    slides: Array.from({ length: 7 }, (_, i) => ({
      id: `s${i + 1}`,
      order: i + 1,
      actionHeadline: `My slide ${i + 1}`,
      blocks: [{ type: 'bullet-list' as const, items: [`My own point ${i + 1}`] }],
      speakerNotes: `My notes ${i + 1}`,
      framework: 'Standard-Narrative' as const,
    })),
    activeSlideIndex: 3,
  };

  it('describes the 5-beat structure without default content', () => {
    expect(CANVA_GAMMA_5_BEATS.map((b) => b.layoutType)).toEqual([
      'cover',
      'two-column',
      'framework',
      'metric-focus',
      'categories',
    ]);
    expect(JSON.stringify(CANVA_GAMMA_5_BEATS)).not.toMatch(/\d+(\.\d+)?%/);
  });

  it('applying a library theme changes only the theme and keeps every slide', () => {
    const updated = applyDeckTheme(userDeck, 'mckinsey-pyramid');

    expect(updated.themeId).toBe('mckinsey-pyramid');
    // Same slides, same order, same content: nothing replaced, nothing dropped.
    expect(updated.slides).toEqual(userDeck.slides);
    expect(updated.activeSlideIndex).toBe(3);
    expect(updated.title).toBe('Rural Clinic Wait Times');
  });

  it('applying a custom theme stores it and keeps the slides', () => {
    const custom = { name: 'Mine', accentColor: '#225588' } as unknown as NonNullable<SlideDeck['customTheme']>;
    const updated = applyDeckTheme(userDeck, undefined, custom);
    expect(updated.customTheme).toBe(custom);
    expect(updated.themeId).toBe('sand-academic');
    expect(updated.slides).toEqual(userDeck.slides);
  });

  it('adds no invented figures to a deck', () => {
    const updated = applyDeckTheme(userDeck, 'apple-cupertino-minimal');
    expect(JSON.stringify(updated.slides)).not.toMatch(/p < 0\.001|99\.99%|12,450|\+84\.2%/);
  });

  it('is5SlideProgression checks layout order only', () => {
    expect(is5SlideProgression(userDeck)).toBe(false);
    const layouts = ['cover', 'two-column', 'framework', 'metric-focus', 'categories'] as const;
    const fiveBeat: SlideDeck = {
      ...userDeck,
      slides: userDeck.slides.slice(0, 5).map((s, i) => ({ ...s, layoutType: layouts[i] })),
    };
    expect(is5SlideProgression(fiveBeat)).toBe(true);
  });
});
