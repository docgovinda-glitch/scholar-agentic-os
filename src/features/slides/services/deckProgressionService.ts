import type { SlideDeck, SlideLayoutType } from '../types/slides';
import type { SlideThemeId, CustomTheme } from '../types/themes';

/** One beat of the classic 5-slide narrative arc (structure only, no content). */
export interface DeckProgressionBeat {
  index: number;
  layoutType: SlideLayoutType;
  beatName: string;
  category: string;
  roleDescription: string;
}

export const CANVA_GAMMA_5_BEATS: DeckProgressionBeat[] = [
  {
    index: 0,
    layoutType: 'cover',
    beatName: 'Cover Hero',
    category: 'EXECUTIVE BRIEFING',
    roleDescription: 'Hero typography, category kicker badge, and institutional provenance',
  },
  {
    index: 1,
    layoutType: 'two-column',
    beatName: 'Executive Synthesis',
    category: 'PROBLEM VS SOLUTION',
    roleDescription: '2-column comparative layout with contrasting cards',
  },
  {
    index: 2,
    layoutType: 'framework',
    beatName: '2D Signature Framework',
    category: 'SIGNATURE FRAMEWORK',
    roleDescription: 'Framework illustration with analytical takeaways',
  },
  {
    index: 3,
    layoutType: 'metric-focus',
    beatName: 'Quantitative Proof',
    category: 'QUANTITATIVE IMPACT',
    roleDescription: 'Metric callout for a figure from your own work',
  },
  {
    index: 4,
    layoutType: 'categories',
    beatName: 'Strategic Roadmap',
    category: 'STRATEGIC HORIZON',
    roleDescription: 'Three-phase sequential horizon with milestone deliverables',
  },
];

/**
 * Applies a theme (library or custom) to a deck. Only the look changes: every
 * slide, its text and its order are kept exactly as the user made them.
 *
 * This replaces the old 5-slide "progression", which rebuilt the deck from
 * templates with invented metrics and dropped any slide after the fifth.
 */
export function applyDeckTheme(
  deck: SlideDeck,
  themeId?: SlideThemeId,
  customTheme?: CustomTheme
): SlideDeck {
  return {
    ...deck,
    themeId: themeId || deck.themeId,
    customTheme: customTheme || deck.customTheme,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Checks whether a deck strictly adheres to the 5-slide narrative progression.
 */
export function is5SlideProgression(deck: SlideDeck): boolean {
  if (!deck.slides || deck.slides.length !== 5) return false;
  return (
    deck.slides[0].layoutType === 'cover' &&
    deck.slides[1].layoutType === 'two-column' &&
    (deck.slides[2].layoutType === 'framework' || deck.slides[2].layoutType === 'image-split') &&
    deck.slides[3].layoutType === 'metric-focus' &&
    deck.slides[4].layoutType === 'categories'
  );
}
