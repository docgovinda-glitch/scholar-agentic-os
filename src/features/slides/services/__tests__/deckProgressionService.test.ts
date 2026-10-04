import { describe, it, expect } from 'vitest';
import {
  CANVA_GAMMA_5_BEATS,
  apply5SlideDeckProgression,
  is5SlideProgression,
} from '../deckProgressionService';
import type { SlideDeck } from '../../types/slides';

describe('deckProgressionService', () => {
  const initialDeck: SlideDeck = {
    id: 'test-deck',
    title: 'Enterprise Digital Transformation',
    topic: 'Enterprise Digital Transformation',
    sourceModule: 'presentation-studio',
    slides: [
      {
        id: 's1',
        order: 1,
        actionHeadline: 'Legacy Systems Cause Inefficiencies',
        blocks: [],
        speakerNotes: '',
        framework: 'Standard-Narrative',
      },
    ],
    activeSlideIndex: 0,
  };

  it('defines 5 distinct Canva & Gamma progression beats', () => {
    expect(CANVA_GAMMA_5_BEATS).toHaveLength(5);
    expect(CANVA_GAMMA_5_BEATS[0].layoutType).toBe('cover');
    expect(CANVA_GAMMA_5_BEATS[1].layoutType).toBe('two-column');
    expect(CANVA_GAMMA_5_BEATS[2].layoutType).toBe('framework');
    expect(CANVA_GAMMA_5_BEATS[3].layoutType).toBe('metric-focus');
    expect(CANVA_GAMMA_5_BEATS[4].layoutType).toBe('categories');
  });

  it('formats deck into 5 distinct slides with bespoke archetypes for McKinsey', () => {
    const updated = apply5SlideDeckProgression(initialDeck, 'mckinsey-pyramid');

    expect(updated.slides).toHaveLength(5);
    expect(is5SlideProgression(updated)).toBe(true);

    // Slide 1: Cover
    expect(updated.slides[0].layoutType).toBe('cover');
    expect(updated.slides[0].order).toBe(1);

    // Slide 2: Two-column synthesis
    expect(updated.slides[1].layoutType).toBe('two-column');
    const twoColBlock = updated.slides[1].blocks.find((b) => b.type === 'two-column');
    expect(twoColBlock).toBeDefined();

    // Slide 3: 2D Signature Framework
    expect(updated.slides[2].layoutType).toBe('framework');
    expect(updated.slides[2].actionHeadline).toContain('Pyramid');
    const imageBlock = updated.slides[2].blocks.find((b) => b.type === 'image');
    expect(imageBlock).toBeDefined();
    if (imageBlock && imageBlock.type === 'image') {
      expect(imageBlock.imageUrl).toBe(''); // triggers 2D sketch illustration
    }

    // Slide 4: Metric Proof
    expect(updated.slides[3].layoutType).toBe('metric-focus');
    const metricBlock = updated.slides[3].blocks.find((b) => b.type === 'metric-callout');
    expect(metricBlock).toBeDefined();

    // Slide 5: Roadmap
    expect(updated.slides[4].layoutType).toBe('categories');
    expect(updated.slides[4].pillars).toHaveLength(3);
    expect(updated.slides[4].pillars?.[0].title).toBe('Phase 01: Foundation');
  });

  it('formats deck with BCG growth-share matrix details for BCG theme', () => {
    const updated = apply5SlideDeckProgression(initialDeck, 'bcg-growth-share-matrix');
    expect(updated.slides[2].actionHeadline).toContain('BCG');
  });

  it('formats deck with Apple silicon details for Cupertino theme', () => {
    const updated = apply5SlideDeckProgression(initialDeck, 'apple-cupertino-minimal');
    expect(updated.slides[2].actionHeadline).toContain('Cupertino');
  });

  it('preserves existing custom headlines if present', () => {
    const deckWithHeadlines: SlideDeck = {
      ...initialDeck,
      slides: [
        {
          id: 's1',
          order: 1,
          actionHeadline: 'User Custom Cover Headline For Transformation',
          blocks: [],
          speakerNotes: '',
          framework: 'Standard-Narrative',
        },
      ],
    };

    const updated = apply5SlideDeckProgression(deckWithHeadlines, 'deloitte-digital-transformation');
    expect(updated.slides[0].actionHeadline).toBe('User Custom Cover Headline For Transformation');
  });

  it('correctly evaluates is5SlideProgression', () => {
    expect(is5SlideProgression(initialDeck)).toBe(false);
    const updated = apply5SlideDeckProgression(initialDeck, 'minimal-slate');
    expect(is5SlideProgression(updated)).toBe(true);
  });
});
