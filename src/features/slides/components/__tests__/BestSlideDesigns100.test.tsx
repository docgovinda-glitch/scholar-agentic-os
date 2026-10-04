// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BEST_100_SLIDE_DESIGNS } from '../../data/bestSlideDesigns100';
import { resolveSlideTheme } from '../../types/themes';
import Step02Design from '../Step02Design';
import type { SlideDeck } from '../../types/slides';

const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

describe('Best 100 Slide Designs & Layout Archetypes', () => {
  it('contains exactly 100 curated, royalty-free slide designs', () => {
    expect(BEST_100_SLIDE_DESIGNS).toHaveLength(100);
  });

  it('verifies correct distribution across 6 elite disciplines', () => {
    const counts = BEST_100_SLIDE_DESIGNS.reduce((acc, d) => {
      acc[d.category] = (acc[d.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(counts['academic']).toBe(20);
    expect(counts['executive']).toBe(20);
    expect(counts['apple-keynote']).toBe(20);
    expect(counts['editorial']).toBe(15);
    expect(counts['scientific']).toBe(15);
    expect(counts['conference']).toBe(10);
  });

  it('validates every design has valid hex codes, swatches, and archetypes', () => {
    const validArchetypes = [
      'executive-stat',
      '2x2-matrix',
      'timeline-milestone',
      'pillar-cards',
      'contrast-split',
      'quote-spotlight',
      'bento-grid',
      'standard-card',
    ];

    BEST_100_SLIDE_DESIGNS.forEach((d) => {
      expect(d.id).toBeTruthy();
      expect(d.name).toBeTruthy();
      expect(d.tagline).toBeTruthy();
      expect(['light', 'dark']).toContain(d.mode);
      expect(d.canvasBg).toMatch(hexRegex);
      expect(d.cardBg).toMatch(hexRegex);
      expect(d.accent).toMatch(hexRegex);
      expect(d.textPrimary).toMatch(hexRegex);
      expect(d.borderHex).toMatch(hexRegex);
      expect(validArchetypes).toContain(d.layoutArchetype);
      expect(d.swatch).toHaveLength(3);
    });
  });

  it('resolveSlideTheme resolves design attributes directly from 100 designs dataset', () => {
    const resolved = resolveSlideTheme('oxford-empirical-monograph');
    expect(resolved.name).toBe('Oxford Empirical Monograph');
    expect(resolved.accent).toBe('#F59E0B');
    expect(resolved.mode).toBe('dark');
    expect(resolved.canvasBg).toBe('#0A192F');
  });

  it('Step 02 handles selecting a design from the 100 library and applies customTheme to deck', () => {
    const onUpdateDeck = vi.fn();
    const mockDeck: SlideDeck = {
      id: 'deck-100-test',
      title: 'Strategic Architecture and Transformation',
      themeId: 'sand-academic',
      activeSlideIndex: 0,
      slides: [
        {
          id: 's1',
          order: 1,
          actionHeadline: 'Autonomous Multi-Agent Consensus Architecture',
          blocks: [],
          speakerNotes: '',
          framework: 'Standard-Narrative',
        },
      ],
    };

    render(
      <Step02Design
        deck={mockDeck}
        onUpdateDeck={onUpdateDeck}
        onPrevStep={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Switch to Explore Library
    const libraryTab = screen.getByRole('tab', { name: /Explore Library|Theme Library/i });
    fireEvent.click(libraryTab);

    // Filter by Apple & Tech
    const appleTab = screen.getByRole('tab', { name: /Apple & Tech/i });
    fireEvent.click(appleTab);

    // Pick Apple Cupertino Minimal
    const cupertinoCard = screen.getByTestId('library-theme-card-apple-cupertino-minimal');
    expect(cupertinoCard).toBeInTheDocument();
    fireEvent.click(cupertinoCard);

    expect(onUpdateDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        themeId: 'apple-cupertino-minimal',
        customTheme: expect.objectContaining({
          name: 'Apple Cupertino Minimal',
          accentColor: '#0071E3',
          canvasBg: '#F5F5F7',
          cardBg: '#FFFFFF',
        }),
      })
    );
  });
});
